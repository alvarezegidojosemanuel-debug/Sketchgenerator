import { expect, it } from "vitest";
import { dropEdgeBlobs } from "@/lib/voice/dsp";

it("quita un «ah» suelto al final de la frase", () => {
  const sr = 8000;
  const tone = (s: number) => Array.from({ length: Math.round(s * sr) }, (_, i) => 0.3 * Math.sin(i * 0.3));
  const sil = (s: number) => Array.from({ length: Math.round(s * sr) }, () => 0);
  const x = Float32Array.from([...sil(0.05), ...tone(1.2), ...sil(0.12), ...tone(0.15), ...sil(0.05)]);
  const y = dropEdgeBlobs(x, sr);
  expect(y.length / sr).toBeLessThan(1.4);
  expect(y.length / sr).toBeGreaterThan(1.2);
});
