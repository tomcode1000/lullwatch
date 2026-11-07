import { describe, expect, it } from "vitest";
import { newClientKeys, open, seal } from "./e2ee";

describe("e2ee", () => {
  it("only the holder of the recipient key can read a sealed message", () => {
    const model = newClientKeys(); // stands in for the model's sealed key
    const sealed = seal("My waters just broke", model.publicHex);
    expect(sealed).not.toContain("waters");
    expect(/^[0-9a-f]+$/.test(sealed)).toBe(true);
    expect(open(sealed, model.x25519Secret)).toBe("My waters just broke");
    expect(() => open(sealed, newClientKeys().x25519Secret)).toThrow();
  });

  it("uses a fresh ephemeral key and nonce every time", () => {
    const model = newClientKeys();
    expect(seal("same", model.publicHex)).not.toBe(seal("same", model.publicHex));
  });

  it("rejects a tampered ciphertext", () => {
    const model = newClientKeys();
    const sealed = seal("hello", model.publicHex);
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("00") ? "01" : "00");
    expect(() => open(flipped, model.x25519Secret)).toThrow();
  });
});
