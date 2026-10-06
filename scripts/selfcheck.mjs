import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outfile = path.resolve("selfcheck.cjs");

await esbuild.build({
  entryPoints: ["src/selfcheck.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile,
  loader: {
    ".txt": "text",
    ".yaml": "text",
  },
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
