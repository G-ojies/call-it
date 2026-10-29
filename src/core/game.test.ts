import { describe, expect, it } from "vitest";
import { cancelQuestion, emptyState, leaderboard, lockQuestion, openQuestion, recordCall, resolveQuestion, viewerStats } from "./game.js";

describe("game state and scoring", () => {
  it("allows one latest call per viewer, then locks and scores Brier loss", () => {
    let state = emptyState();
    state = openQuestion(state, "Will it rain?").state;
    state = recordCall(state, "Alice", 0.2).state;
    state = recordCall(state, "ALICE", 0.8).state;
    state = recordCall(state, "bob", 0.1).state;
    expect(state.question?.calls).toEqual({ alice: 0.8, bob: 0.1 });
    state = lockQuestion(state).state;
    expect(recordCall(state, "alice", 0.5).ok).toBe(false);
    const result = resolveQuestion(state, 1);
    expect(result.ok).toBe(true);
    expect(result.resolved?.[0].brier).toBeCloseTo(0.04);
    expect(result.resolved?.[1].brier).toBeCloseTo(0.81);
    expect(result.state.scores.alice[0]).toBeCloseTo(0.04);
    expect(result.state.question).toBeNull();
  });

  it("refuses overlapping questions and cancellation discards calls", () => {
    let state = openQuestion(emptyState(), "First").state;
    expect(openQuestion(state, "Second").ok).toBe(false);
    state = recordCall(state, "alice", 0.5).state;
    state = cancelQuestion(state).state;
    expect(state.question).toBeNull();
    expect(state.scores).toEqual({});
  });

  it("requires a locked question to resolve", () => {
    const state = openQuestion(emptyState(), "Question").state;
    expect(resolveQuestion(state, 0).ok).toBe(false);
  });

  it("calculates viewer mean and minimum-call leaderboard sorted low first", () => {
    let state = emptyState();
    for (let i = 0; i < 3; i++) {
      state = openQuestion(state, `Question ${i}`).state;
      state = recordCall(state, "good", 0.9).state;
      state = recordCall(state, "bad", 0.1).state;
      state = lockQuestion(state).state;
      state = resolveQuestion(state, 1).state;
    }
    state = openQuestion(state, "Fourth").state;
    state = recordCall(state, "good", 0.9).state;
    state = lockQuestion(state).state;
    state = resolveQuestion(state, 1).state;
    expect(viewerStats(state, "GOOD").mean).toBeCloseTo(0.01);
    expect(viewerStats(state, "GOOD").count).toBe(4);
    const ranked = leaderboard(state);
    expect(ranked.map(({ viewer, count }) => ({ viewer, count }))).toEqual([
      { viewer: "good", count: 4 }, { viewer: "bad", count: 3 }
    ]);
    expect(ranked[0].mean).toBeCloseTo(0.01);
    expect(ranked[1].mean).toBeCloseTo(0.81);
  });
});
