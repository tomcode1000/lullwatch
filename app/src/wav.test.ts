import { expect, it } from "vitest";
import { encodeWav } from "./Voice";

it("encodes 16 kHz mono 16-bit PCM WAV, the format Whisper accepts", async () => {
  const blob = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 16_000);
  const v = new DataView(await blob.arrayBuffer());
  const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(o + i)));
  expect(tag(0)).toBe("RIFF");
  expect(tag(8)).toBe("WAVE");
  expect(v.getUint16(22, true)).toBe(1); // mono
  expect(v.getUint32(24, true)).toBe(16_000);
  expect(v.getUint16(34, true)).toBe(16); // bits
  expect(v.getUint32(40, true)).toBe(10); // 5 samples x 2 bytes
  expect(v.getInt16(44 + 3 * 2, true)).toBe(0x7fff); // clipped to full scale
  expect(blob.type).toBe("audio/wav");
});
