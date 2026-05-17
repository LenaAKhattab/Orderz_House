const fs = require("fs");
const p = "frontend/src/components/plans/PlanCard.jsx";
let s = fs.readFileSync(p, "utf8");
s = s.replace(/\{installment\}<\/div>/g, "{installment}</p>");
s = s.replace(/\{paymentNotes\}<\/motionGrid>/g, "{paymentNotes}</p>");
s = s.replace(/\{paymentNotes\}<\/motionGrid>/g, "{paymentNotes}</p>");
s = s.replace(/\{paymentNotes\}<\/div>/g, "{paymentNotes}</p>");
fs.writeFileSync(p, s);
console.log("done");
