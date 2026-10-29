import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands.js";

describe("parseCommand", () => {
  it("parses question text and moderation commands", () => {
    expect(parseCommand("!q Will it rain?" )).toEqual({ type: "question", text: "Will it rain?" });
    expect(parseCommand("!yes")).toEqual({ type: "resolve", outcome: 1 });
    expect(parseCommand("!no")).toEqual({ type: "resolve", outcome: 0 });
  });

  it.each([["70", 0.7], ["70%", 0.7], ["0.7", 0.7], ["0", 0], ["100", 1]])("parses !call %s", (input, probability) => {
    expect(parseCommand(`!call ${input}`)).toEqual({ type: "call", probability });
  });

  it.each(["101", "-1", "1.1", "wat", "", "70 %"]) ("rejects invalid call %s", (input) => {
    expect(parseCommand(`!call ${input}`)).toEqual({ type: "unknown" });
  });
});
