export interface Call {
  viewer: string;
  probability: number;
}

export interface ResolvedCall extends Call {
  outcome: 0 | 1;
  brier: number;
}

export interface Question {
  text: string;
  status: "open" | "locked";
  calls: Record<string, number>;
}

export interface GameState {
  question: Question | null;
  scores: Record<string, number[]>;
}

export type Command =
  | { type: "question"; text: string }
  | { type: "call"; probability: number }
  | { type: "lock" }
  | { type: "resolve"; outcome: 0 | 1 }
  | { type: "cancel" }
  | { type: "me" }
  | { type: "unknown" };

export type ActionResult =
  | { ok: true; message: string; state: GameState; resolved?: ResolvedCall[] }
  | { ok: false; message: string; state: GameState };
