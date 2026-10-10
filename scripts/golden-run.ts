/** Entry bundled by scripts/golden.mjs: writes scripts/golden/golden.json. */
import fs from "node:fs";
import path from "node:path";
import { setLanguage } from "../src/i18n";
import { buildPrintHtml } from "../src/pdf";
import { buildNote } from "../src/sites";
import { GOLDEN_CASES, runGoldenCase } from "./golden-cases";

setLanguage("en");
const result: Record<string, { note: string | null; print: string | null }> = {};
for (const item of GOLDEN_CASES) {
  result[item.name] = runGoldenCase(item, { buildNote, buildPrintHtml });
}
const dir = path.resolve("scripts", "golden");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "golden.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`golden: wrote ${Object.keys(result).length} cases`);
