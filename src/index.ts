import "dotenv/config";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import tmi from "tmi.js";
import { cancelQuestion, emptyState, leaderboard, lockQuestion, openQuestion, recordCall, resolveQuestion, viewerStats } from "./core/game.js";
import { parseCommand } from "./core/commands.js";
import type { ActionResult, GameState } from "./core/types.js";
import { startWebServer, type OverlayState } from "./server.js";

const channel = process.env.TWITCH_CHANNEL?.replace(/^#/, "").trim();
if (!channel) throw new Error("Set TWITCH_CHANNEL in .env.");
const postReplies = Boolean(process.env.TWITCH_BOT_USERNAME && process.env.TWITCH_OAUTH_TOKEN);
const port = Number(process.env.PORT ?? 3030);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port number.");
const statePath = resolve(process.env.SESSION_FILE ?? "data/session.json");

async function loadState(): Promise<GameState> {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as Partial<GameState>;
    if (!parsed.scores || typeof parsed.scores !== "object") return emptyState();
    return { question: parsed.question ?? null, scores: parsed.scores };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw error;
  }
}

async function saveState(next: GameState): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporaryPath, statePath);
}

let state = await loadState();
let reveal: { question: string; calls: Record<string, number>; outcome: 0 | 1; leaders: OverlayState["leaders"] } | null = null;
let broadcast = () => {};

function overlayState(): OverlayState {
  const question = reveal?.question ?? state.question?.text ?? null;
  const calls = reveal?.calls ?? state.question?.calls ?? {};
  const histogram = Array(10).fill(0) as number[];
  const probabilities = Object.values(calls);
  for (const probability of probabilities) histogram[Math.min(9, Math.floor(probability * 10))] += 1;
  const mean = probabilities.length ? probabilities.reduce((sum, probability) => sum + probability, 0) / probabilities.length : null;
  const status: OverlayState["status"] = reveal
    ? `RESOLVED ${reveal.outcome ? "YES" : "NO"}`
    : state.question?.status === "open" ? "OPEN"
      : state.question?.status === "locked" ? "LOCKED" : "IDLE";
  return {
    question,
    status,
    histogram,
    mean,
    callCount: probabilities.length,
    revealOutcome: reveal?.outcome ?? null,
    leaders: reveal?.leaders ?? []
  };
}

const webServer = startWebServer({
  port,
  getState: () => state,
  getOverlayState: overlayState,
  control: async (action) => {
    let result: ActionResult;
    switch (action.type) {
      case "question": result = openQuestion(state, action.text ?? ""); break;
      case "lock": result = lockQuestion(state); break;
      case "resolve": result = resolveQuestion(state, action.outcome === 0 ? 0 : 1); break;
      case "cancel": result = cancelQuestion(state); break;
    }
    if (!result.ok) return { ok: false, message: result.message };
    await applyState(result, action.type === "resolve" ? action.outcome === 0 ? 0 : 1 : undefined);
    return { ok: true, message: result.message };
  }
});
broadcast = webServer.broadcast;

async function applyState(result: ActionResult, resolvedOutcome?: 0 | 1): Promise<void> {
  if (!result.ok) return;
  const previousQuestion = state.question;
  state = result.state;
  await saveState(state);
  if (resolvedOutcome !== undefined && previousQuestion) {
    reveal = {
      question: previousQuestion.text,
      calls: previousQuestion.calls,
      outcome: resolvedOutcome,
      leaders: leaderboard(state).slice(0, 5)
    };
  } else if (result.state.question === null || result.state.question !== previousQuestion) {
    reveal = null;
  }
  broadcast();
}

const client = new tmi.Client({
  options: { debug: false },
  connection: { reconnect: true, secure: true },
  identity: postReplies
    ? { username: process.env.TWITCH_BOT_USERNAME!, password: process.env.TWITCH_OAUTH_TOKEN!.startsWith("oauth:") ? process.env.TWITCH_OAUTH_TOKEN! : `oauth:${process.env.TWITCH_OAUTH_TOKEN}` }
    : undefined,
  channels: [channel]
});

await client.connect();
console.log(`Call It connected to #${channel} (${postReplies ? "reply mode" : "read-only mode"}).`);

client.on("message", async (target, tags, message, self) => {
  if (self) return;
  const command = parseCommand(message);
  if (command.type === "unknown") return;
  const username = tags.username?.toLowerCase();
  if (!username) return;
  const badges = tags.badges ?? {};
  const isModerator = badges.broadcaster === "1" || badges.moderator === "1";
  let result: ActionResult | undefined;
  let resolvedOutcome: 0 | 1 | undefined;

  switch (command.type) {
    case "question":
      if (!isModerator) return;
      result = openQuestion(state, command.text);
      break;
    case "call":
      result = recordCall(state, username, command.probability);
      break;
    case "lock":
      if (!isModerator) return;
      result = lockQuestion(state);
      break;
    case "resolve":
      if (!isModerator) return;
      result = resolveQuestion(state, command.outcome);
      resolvedOutcome = command.outcome;
      break;
    case "cancel":
      if (!isModerator) return;
      result = cancelQuestion(state);
      break;
    case "me": {
      if (!postReplies) return;
      const stats = viewerStats(state, username);
      await client.say(target, stats.count
        ? `@${username} your mean Brier score is ${stats.mean.toFixed(4)} across ${stats.count} call${stats.count === 1 ? "" : "s"}.`
        : `@${username} no resolved calls yet.`);
      return;
    }
  }

  if (!result) return;
  if (!result.ok) {
    if (postReplies) await client.say(target, result.message);
    return;
  }
  await applyState(result, resolvedOutcome);
  if (postReplies) await client.say(target, result.message);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await client.disconnect();
    webServer.httpServer.close();
    process.exit(0);
  });
}
