import { cancelQuestion, emptyState, leaderboard, lockQuestion, openQuestion, recordCall, resolveQuestion } from "./core/game.js";
import type { ActionResult, GameState } from "./core/types.js";
import { startWebServer, type ControlAction, type OverlayState } from "./server.js";

const port = Number(process.env.PORT ?? 3030);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port number.");
let state: GameState = emptyState();
let resolvedView: { question: string; calls: Record<string, number>; outcome: 0 | 1; leaders: OverlayState["leaders"] } | null = null;

function overlayState(): OverlayState {
  const calls = resolvedView?.calls ?? state.question?.calls ?? {};
  const probabilities = Object.values(calls);
  const histogram = Array(10).fill(0) as number[];
  for (const probability of probabilities) histogram[Math.min(9, Math.floor(probability * 10))] += 1;
  return {
    question: resolvedView?.question ?? state.question?.text ?? null,
    status: resolvedView
      ? `RESOLVED ${resolvedView.outcome ? "YES" : "NO"}`
      : state.question?.status === "open" ? "OPEN"
        : state.question?.status === "locked" ? "LOCKED" : "IDLE",
    histogram,
    mean: probabilities.length ? probabilities.reduce((sum, probability) => sum + probability, 0) / probabilities.length : null,
    callCount: probabilities.length,
    revealOutcome: resolvedView?.outcome ?? null,
    leaders: resolvedView?.leaders ?? []
  };
}

let broadcast = () => {};
async function apply(result: ActionResult, outcome?: 0 | 1): Promise<string> {
  if (!result.ok) return result.message;
  const previous = state.question;
  state = result.state;
  if (outcome !== undefined && previous) {
    resolvedView = { question: previous.text, calls: previous.calls, outcome, leaders: leaderboard(state).slice(0, 5) };
  } else if (state.question === null || state.question !== previous) {
    resolvedView = null;
  }
  broadcast();
  return result.message;
}

const webServer = startWebServer({
  port,
  getState: () => state,
  getOverlayState: overlayState,
  control: async (action: ControlAction) => {
    let result: ActionResult;
    switch (action.type) {
      case "question": result = openQuestion(state, action.text ?? ""); break;
      case "lock": result = lockQuestion(state); break;
      case "resolve": result = resolveQuestion(state, action.outcome === 0 ? 0 : 1); break;
      case "cancel": result = cancelQuestion(state); break;
    }
    if (!result.ok) return { ok: false, message: result.message };
    await apply(result, action.type === "resolve" ? action.outcome === 0 ? 0 : 1 : undefined);
    return { ok: true, message: result.message };
  }
});
broadcast = webServer.broadcast;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
function shuffle<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}
const viewers = Array.from({ length: 40 }, (_, index) => ({
  name: `chatter_${String(index + 1).padStart(2, "0")}`,
  style: index < 16 ? "calibrated" : index < 28 ? "overconfident" : "random"
} as const));
const questions = [
  "Will the next game go to overtime?",
  "Will the streamer beat this boss on the next attempt?",
  "Will the next match have more than 3 goals?",
  "Will the stream hit its next viewer milestone today?",
  "Will the final round finish in under 5 minutes?"
];

async function simulateQuestion(text: string, index: number): Promise<void> {
  console.log(`Demo: opening question ${index + 1}/5 — ${text}`);
  let result = openQuestion(state, text);
  if (!result.ok) {
    console.log(`Demo paused: ${result.message}`);
    return;
  }
  await apply(result);
  await sleep(1800);

  const latent = viewers.map(() => randomBetween(0.12, 0.88));
  const calibrationMean = latent.slice(0, 16).reduce((sum, probability) => sum + probability, 0) / 16;
  const outcome: 0 | 1 = Math.random() < calibrationMean ? 1 : 0;
  const calls = viewers.map((viewer, viewerIndex) => {
    const estimate = latent[viewerIndex];
    const probability = viewer.style === "calibrated"
      ? estimate
      : viewer.style === "overconfident"
        ? estimate >= 0.5 ? randomBetween(0.91, 0.995) : randomBetween(0.005, 0.09)
        : Math.random();
    return { viewer, probability };
  });
  shuffle(calls);

  for (const { viewer, probability } of calls) {
    result = recordCall(state, viewer.name, probability);
    if (result.ok) await apply(result);
    await sleep(randomBetween(250, 700));
  }
  await sleep(900);
  result = lockQuestion(state);
  if (!result.ok) return;
  await apply(result);
  await sleep(1200);
  result = resolveQuestion(state, outcome);
  if (!result.ok) return;
  await apply(result, outcome);
  console.log(`Demo: resolved ${outcome ? "YES" : "NO"}; showing the reveal.`);
  await sleep(6000);
}

async function runDemo(): Promise<void> {
  console.log(`Call It demo running at http://localhost:${port}/overlay`);
  console.log("Simulating 40 chatters: 16 calibrated, 12 overconfident, and 12 random.");
  await sleep(2500);
  for (let index = 0; index < questions.length; index++) {
    await simulateQuestion(questions[index], index);
  }
  console.log("Demo complete. The final result remains on the overlay; press Ctrl+C to stop.");
}

void runDemo().catch((error: unknown) => {
  console.error("Demo simulation failed:", error);
  webServer.httpServer.close();
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => webServer.httpServer.close(() => process.exit(0)));
}
