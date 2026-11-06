import { describe, expect, it } from "vitest";
import { interpret } from "./commands";

describe("interpret", () => {
  it.each(["Now.", "now", "Start!", "It's starting.", "Okay, now", "Here it comes"])("%s starts a contraction", (t) => {
    expect(interpret(t).kind).toBe("start");
  });

  it.each(["Stop.", "Done", "It's over.", "it stopped", "Okay done"])("%s stops it", (t) => {
    expect(interpret(t).kind).toBe("stop");
  });

  it.each(["Thank you.", "", " you ", "Thanks for watching!", "hmm", "oh my"])("%s is ignored", (t) => {
    expect(interpret(t).kind).toBe("ignore");
  });

  it("longer speech is a question", () => {
    expect(interpret("How long until I need to leave?")).toEqual({
      kind: "question",
      text: "How long until I need to leave?",
    });
  });
});
