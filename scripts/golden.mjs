/**
 * Regenerate scripts/golden/golden.json from the *current* build.
 * Run only when an output change is intentional (review the git diff afterwards).
 */
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outfile = path.resolve("golden-run.cjs");

await esbuild.build({
  entryPoints: ["scripts/golden-run.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile,
  loader: { ".txt": "text", ".yaml": "text" },
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
