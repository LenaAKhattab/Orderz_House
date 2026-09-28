import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../src");
const arabic = /[\u0600-\u06FF]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(root, p).replaceAll("\\", "/");
    if (rel.startsWith("locales/") || rel.includes(".test.")) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(jsx|js)$/.test(name)) out.push(p);
  }
  return out;
}

const rows = [];
for (const file of walk(root)) {
  const lines = readFileSync(file, "utf8").split("\n");
  let n = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    if (arabic.test(line)) n += 1;
  }
  if (n) rows.push([n, relative(root, file).replaceAll("\\", "/")]);
}
rows.sort((a, b) => b[0] - a[0]);
let total = 0;
for (const [n, file] of rows) {
  total += n;
  console.log(String(n).padStart(4), file);
}
console.log("FILES", rows.length, "LINES", total);
