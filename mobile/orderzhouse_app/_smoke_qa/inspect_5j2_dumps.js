const fs = require("fs");
const path = require("path");
const dir = __dirname;
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith("5j2_") && x.endsWith(".xml")).sort()) {
  const xml = fs.readFileSync(path.join(dir, f), "utf8");
  const t = [
    ...new Set(
      [...xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)].map((m) =>
        m[1].replace(/&#10;/g, " / ").trim()
      )
    ),
  ].filter(Boolean);
  if (!t.length) continue;
  console.log("====", f, "====");
  console.log(t.slice(0, 22).join("\n"));
}
