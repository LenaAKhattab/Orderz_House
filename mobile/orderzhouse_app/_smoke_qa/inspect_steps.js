const fs = require("fs");
const path = require("path");
const files = [
  "5j2_step_type.xml",
  "5j2_step_type_next.xml",
  "5j2_step_cat.xml",
  "5j2_step_cat_next.xml",
  "5j2_step_sub.xml",
  "5j2_pre_details_0.xml",
  "5j2_pre_details_1.xml",
  "5j2_review_create.xml",
];
for (const f of files) {
  const p = path.join(__dirname, f);
  console.log("====", f, "exists=", fs.existsSync(p), "====");
  if (!fs.existsSync(p)) continue;
  const xml = fs.readFileSync(p, "utf8");
  const t = [
    ...new Set(
      [...xml.matchAll(/(?:text|content-desc)="([^"]*)"/g)].map((m) =>
        m[1].replace(/&#10;/g, " / ").trim()
      )
    ),
  ].filter(Boolean);
  console.log(t.slice(0, 35).join("\n"));
}
