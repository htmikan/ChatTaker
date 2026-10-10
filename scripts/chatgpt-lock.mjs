/**
 * Guard for the verified ChatGPT implementation.
 *
 *   node scripts/chatgpt-lock.mjs          verify src/sites/chatgpt/** against scripts/chatgpt-lock.json
 *   node scripts/chatgpt-lock.mjs --write  record the current hash (npm run lock:chatgpt)
 *
 * `npm run check` runs the verify mode first, so editing ChatGPT files while working on Gemini
 * fails loudly. After an intentional ChatGPT change, re-verify it in the app and run the --write mode.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src", "sites", "chatgpt");
const lockPath = path.resolve("scripts", "chatgpt-lock.json");

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out.sort();
}

function digest() {
  const hash = crypto.createHash("sha256");
  const files = listFiles(root);
  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    // Normalize line endings so CRLF checkouts hash the same as LF.
    const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    hash.update(`${rel}\0${text}\0`);
  }
  return { sha256: hash.digest("hex"), files: files.map((file) => path.relative(root, file).replace(/\\/g, "/")) };
}

const current = digest();

if (process.argv.includes("--write")) {
  fs.writeFileSync(lockPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  console.log(`chatgpt-lock: recorded ${current.files.length} files (${current.sha256.slice(0, 12)})`);
} else {
  if (!fs.existsSync(lockPath)) {
    console.error("chatgpt-lock: scripts/chatgpt-lock.json is missing. Run: npm run lock:chatgpt");
    process.exit(1);
  }
  const locked = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  if (locked.sha256 !== current.sha256) {
    console.error(
      "chatgpt-lock: src/sites/chatgpt changed since it was locked.\n" +
        "  If this is intentional, verify ChatGPT in the app, then run: npm run lock:chatgpt\n" +
        "  Otherwise revert the change (Gemini work belongs in src/sites/gemini).",
    );
    process.exit(1);
  }
  console.log(`chatgpt-lock ok (${current.files.length} files)`);
}
