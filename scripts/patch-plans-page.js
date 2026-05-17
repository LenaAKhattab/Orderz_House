const fs = require("fs");
const p = "frontend/src/pages/dashboard/SuperAdminPlansPage.jsx";
let s = fs.readFileSync(p, "utf8");
const start = s.indexOf('<PlanFormSection title="السعر والمدة والترتيب">');
const optsStart = s.indexOf('<PlanFormSection title="خيارات الباقة"');
const end = s.indexOf("</PlanFormSection>", optsStart) + "</PlanFormSection>".length;
if (start < 0 || optsStart < 0 || end < 0) {
  console.error("markers not found", start, optsStart, end);
  process.exit(1);
}
const insert =
  '            <PlanExtendedFields form={form} setForm={setForm} submitting={submitting} />\n\n';
s = s.slice(0, start) + insert + s.slice(end);
if (!s.includes("PlanExtendedFields")) {
  console.error("import missing");
}
s = s.replace(/import PlanToggle from[^\n]+\n/, "");
fs.writeFileSync(p, s);
console.log("patched");
