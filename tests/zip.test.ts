import { describe, expect, it } from "vitest";
import { crc32, makeZip } from "@/lib/export/zip";

describe("zip", () => {
  it("crc32 conocido", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("estructura: cabeceras y fin de directorio", async () => {
    const z = new Uint8Array(await makeZip([{ name: "a.txt", data: new TextEncoder().encode("hola") }, { name: "ñ/b.png", data: new Uint8Array([1, 2, 3]) }]).arrayBuffer());
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(z.length - 12, true)).toBe(2);
  });
});
