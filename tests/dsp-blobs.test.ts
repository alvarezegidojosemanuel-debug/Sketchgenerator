import { expect, it } from "vitest";
import { dropEdgeBlobs } from "@/lib/voice/dsp";

it("quita un «ah» suelto al final de la frase", () => {
  const sr = 8000;
  const tone = (s: number) => Array.from({ length: Math.round(s * sr) }, (_, i) => 0.3 * Math.sin(i * 0.3));
  const sil = (s: number) => Array.from({ length: Math.round(s * sr) }, () => 0);
  const x = Float32Array.from([...sil(0.05), ...tone(1.2), ...sil(0.12), ...tone(0.15), ...sil(0.05)]);
  const y = dropEdgeBlobs(x, sr, 0.012, 0.07, 0.18);
  expect(y.length / sr).toBeLessThan(1.4);
  expect(y.length / sr).toBeGreaterThan(1.2);
});

it("no se come una sílaba final de 0,25 s («…psicó-pata»)", () => {
  const sr = 8000;
  const tone = (s: number) => Array.from({ length: Math.round(s * sr) }, (_, i) => 0.3 * Math.sin(i * 0.3));
  const sil = (s: number) => Array.from({ length: Math.round(s * sr) }, () => 0);
  const x = Float32Array.from([...tone(1.2), ...sil(0.08), ...tone(0.25), ...sil(0.05)]);
  expect(dropEdgeBlobs(x, sr, 0.012, 0.07, 0.18).length / sr).toBeGreaterThan(1.5);
});
