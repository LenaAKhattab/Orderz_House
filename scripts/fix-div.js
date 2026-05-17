const fs = require("fs");
const files = process.argv.slice(2);
for (const p of files) {
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replaceAll("motionGrid", "div"));
  console.log("fixed", p);
}
