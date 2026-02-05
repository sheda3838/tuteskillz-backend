import db from "./config/db.js";
import fs from "fs";

async function check() {
  try {
    const [rows] = await db.promise().query("DESCRIBE payment");
    let output = "Field | Type | Null | Default\n";
    rows.forEach((r) => {
      output += `${r.Field} | ${r.Type} | ${r.Null} | ${r.Default}\n`;
    });
    fs.writeFileSync("schema_dump.txt", output);
    console.log("Written to schema_dump.txt");
  } catch (err) {
    console.error(err);
  }
  process.exit();
}
check();
