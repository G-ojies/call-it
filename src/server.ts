import express from "express";
import { createServer, type Server as HttpServer } from "node:http";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import type { GameState } from "./core/types.js";

const publicDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../public");

export interface OverlayState {
  question: string | null;
  status: "OPEN" | "LOCKED" | "RESOLVED YES" | "RESOLVED NO" | "IDLE";
  histogram: number[];
  mean: number | null;
  callCount: number;
  revealOutcome: 0 | 1 | null;
  leaders: Array<{ viewer: string; mean: number; count: number }>;
}

export interface ControlAction {
  type: "question" | "lock" | "resolve" | "cancel";
  text?: string;
  outcome?: 0 | 1;
}

export interface ServerOptions {
  port: number;
  getState: () => GameState;
  getOverlayState: () => OverlayState;
  control: (action: ControlAction) => Promise<{ ok: boolean; message: string }>;
}

function isLocalAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.startsWith("::ffff:") ? address.slice(7) : address;
  return normalized === "::1" || normalized === "127.0.0.1" || (isIP(normalized) === 4 && normalized.startsWith("127."));
}

export function startWebServer(options: ServerOptions): { httpServer: HttpServer; broadcast: () => void } {
  const app = express();
  const httpServer = createServer(app);
  const sockets = new WebSocketServer({ server: httpServer, path: "/ws" });

  app.use(express.json({ limit: "8kb" }));
  app.get("/overlay", (_req, res) => res.sendFile(resolve(publicDirectory, "overlay.html")));
  app.get("/control", (req, res) => isLocalAddress(req.socket.remoteAddress)
    ? res.sendFile(resolve(publicDirectory, "control.html"))
    : res.status(403).send("Control is available from localhost only."));
  app.use("/assets", express.static(publicDirectory, { fallthrough: false }));
  app.post("/api/control", async (req, res) => {
    if (!isLocalAddress(req.socket.remoteAddress)) {
      res.status(403).json({ ok: false, message: "Control is available from localhost only." });
      return;
    }
    const action = req.body as ControlAction;
    if (!action || !["question", "lock", "resolve", "cancel"].includes(action.type)) {
      res.status(400).json({ ok: false, message: "Invalid control action." });
      return;
    }
    try {
      const result = await options.control(action);
      res.status(result.ok ? 200 : 409).json(result);
    } catch (error) {
      console.error("Control action failed:", error);
      res.status(500).json({ ok: false, message: "Unable to apply control action." });
    }
  });

  const broadcast = () => {
    const message = JSON.stringify(options.getOverlayState());
    for (const socket of sockets.clients) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  };
  sockets.on("connection", (socket) => {
    socket.send(JSON.stringify(options.getOverlayState()));
  });
  httpServer.listen(options.port, () => console.log(`Call It web server listening on port ${options.port}.`));
  return { httpServer, broadcast };
}
