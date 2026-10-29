import type { ActionResult, GameState, ResolvedCall } from "./types.js";

export function emptyState(): GameState {
  return { question: null, scores: {} };
}

function fail(state: GameState, message: string): ActionResult {
  return { ok: false, message, state };
}

export function openQuestion(state: GameState, text: string): ActionResult {
  if (state.question) return fail(state, "A question is already open.");
  const clean = text.trim();
  if (!clean) return fail(state, "Add a question after !q.");
  return { ok: true, message: `Question: ${clean} Calls are open; use !call <0-100>.`, state: { ...state, question: { text: clean, status: "open", calls: {} } } };
}

export function recordCall(state: GameState, viewer: string, probability: number): ActionResult {
  const question = state.question;
  if (!question) return fail(state, "There is no open question.");
  if (question.status !== "open") return fail(state, "Calls are locked.");
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) return fail(state, "Call must be between 0 and 100%.");
  const calls = { ...question.calls, [viewer.toLowerCase()]: probability };
  return { ok: true, message: `${viewer}, your call is ${Math.round(probability * 100)}% YES.`, state: { ...state, question: { ...question, calls } } };
}

export function lockQuestion(state: GameState): ActionResult {
  if (!state.question) return fail(state, "There is no open question.");
  if (state.question.status === "locked") return fail(state, "Calls are already locked.");
  return { ok: true, message: `Calls locked for: ${state.question.text}`, state: { ...state, question: { ...state.question, status: "locked" } } };
}

export function resolveQuestion(state: GameState, outcome: 0 | 1): ActionResult {
  if (!state.question) return fail(state, "There is no open question.");
  if (state.question.status !== "locked") return fail(state, "Lock calls before resolving.");
  const resolved: ResolvedCall[] = Object.entries(state.question.calls).map(([viewer, probability]) => ({
    viewer, probability, outcome, brier: (probability - outcome) ** 2
  }));
  const scores = { ...state.scores };
  for (const call of resolved) scores[call.viewer] = [...(scores[call.viewer] ?? []), call.brier];
  return { ok: true, message: `Resolved ${state.question.text}: ${outcome ? "YES" : "NO"}. ${resolved.length} call${resolved.length === 1 ? "" : "s"} scored.`, state: { question: null, scores }, resolved };
}

export function cancelQuestion(state: GameState): ActionResult {
  if (!state.question) return fail(state, "There is no open question.");
  return { ok: true, message: `Cancelled: ${state.question.text}`, state: { ...state, question: null } };
}

export function viewerStats(state: GameState, viewer: string): { mean: number; count: number } {
  const values = state.scores[viewer.toLowerCase()] ?? [];
  return { mean: values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : 0, count: values.length };
}

export function leaderboard(state: GameState, minimumCalls = 3): Array<{ viewer: string; mean: number; count: number }> {
  return Object.entries(state.scores)
    .filter(([, scores]) => scores.length >= minimumCalls)
    .map(([viewer, scores]) => ({ viewer, count: scores.length, mean: scores.reduce((sum, n) => sum + n, 0) / scores.length }))
    .sort((a, b) => a.mean - b.mean || a.viewer.localeCompare(b.viewer));
}
