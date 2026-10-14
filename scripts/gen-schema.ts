/** Genera schema/pocket.schema.json desde el esquema Zod (fuente única de verdad). */
import fs from "node:fs";
import path from "node:path";
import { pocketJsonSchema } from "../src/lib/schema/json-schema";

const out = path.resolve(__dirname, "../schema/pocket.schema.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(pocketJsonSchema(), null, 2) + "\n");
console.log(`Escrito ${path.relative(process.cwd(), out)}`);
