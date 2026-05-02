import fs from "fs";
import path from "path";

function walk(dir) {
  const out = [];
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, n.name);
    if (n.isDirectory() && n.name !== "node_modules") out.push(...walk(p));
    else if (n.name.endsWith(".jsx")) out.push(p);
  }
  return out;
}

const files = walk("src");
const set = new Set();
for (const f of files) {
  const t = fs.readFileSync(f, "utf8");
  const patterns = [
    /className="([^"]*)"/g,
    /className='([^']*)'/g,
    /className=\{\s*`([^`]*)`\s*\}/g,
    /className=\{\([^)]*\)\s*=>\s*`([^`]*)`\}/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(t))) {
      m[1].split(/\s+/).forEach((c) => {
        const x = c.replace(/\$\{[^}]+\}/g, "").trim();
        if (!x) return;
        set.add(x);
      });
    }
  }
}
const list = [...set].filter(Boolean).sort();
console.log(list.join("\n"));
console.error("count", list.length);
