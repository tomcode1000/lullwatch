import { describe, expect, it } from "vitest";
import { interpret } from "./commands";

describe("interpret", () => {
  it.each(["Now.", "now", "Start!", "It's starting.", "Okay, now", "Here it comes"])("%s starts a contraction", (t) => {
    expect(interpret(t).kind).toBe("start");
  });

  it.each(["Stop.", "Done", "It's over.", "it stopped", "Okay done"])("%s stops it", (t) => {
    expect(interpret(t).kind).toBe("stop");
  });

  // Including what Whisper returned for pure background noise in testing.
  it.each(["Thank you.", "", " you ", "Thanks for watching!", "hmm", "oh my", "Gracias.", "はい", "Okay.", "."])("%s is ignored", (t) => {
    expect(interpret(t).kind).toBe("ignore");
  });

  it("longer speech is a question", () => {
    expect(interpret("How long until I need to leave?")).toEqual({
      kind: "question",
      text: "How long until I need to leave?",
    });
  });
});
