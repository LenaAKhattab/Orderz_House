const fs = require("fs");
const path = require("path");
const files = ["j2f_login.xml", "j2f_email.xml", "j2f_presub.xml", "j2f_home.xml", "j2f_auth.xml", "j2f_out.xml"];
for (const f of files) {
  const p = path.join(__dirname, f);
  console.log("====", f, fs.existsSync(p), "====");
  if (!fs.existsSync(p)) continue;
  const xml = fs.readFileSync(p, "utf8");
  const t = [
    ...new Set(
      [...xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)].map((m) =>
        m[1].replace(/&#10;/g, " / ").trim()
      )
    ),
  ].filter(Boolean);
  console.log(t.slice(0, 20).join("\n"));
}
