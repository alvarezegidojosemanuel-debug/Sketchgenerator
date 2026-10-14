import fs from "node:fs";
import path from "node:path";
import type { Catalog } from "@/lib/catalog/types";
import type { PocketProject } from "@/lib/schema/pocket";

export const root = path.resolve(__dirname, "..");
export const readJson = <T = unknown>(rel: string): T => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as T;
export const catalog = readJson<Catalog>("src/data/catalog.json");
export const demo = () => readJson<PocketProject>("examples/sketch-demo.json");
