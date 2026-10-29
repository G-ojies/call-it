import type { Command } from "./types.js";

/** Parse supported chat commands without performing I/O. */
export function parseCommand(message: string): Command {
  const trimmed = message.trim();
  const [rawName, ...rest] = trimmed.split(/\s+/);
  const name = rawName?.toLowerCase();
  const argument = rest.join(" ").trim();

  if (name === "!q") return argument ? { type: "question", text: argument } : { type: "unknown" };
  if (name === "!call") {
    const match = /^(\d+(?:\.\d+)?)(%)?$/.exec(argument);
    if (!match) return { type: "unknown" };
    const raw = Number(match[1]);
    if (!match[2] && match[1].includes(".") && raw > 1) return { type: "unknown" };
    const probability = match[2] ? raw / 100 : match[1].includes(".") ? raw : raw / 100;
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) return { type: "unknown" };
    return { type: "call", probability };
  }
  if (name === "!lock" && !argument) return { type: "lock" };
  if ((name === "!yes" || name === "!no") && !argument) return { type: "resolve", outcome: name === "!yes" ? 1 : 0 };
  if (name === "!cancel" && !argument) return { type: "cancel" };
  if (name === "!me" && !argument) return { type: "me" };
  return { type: "unknown" };
}
