import db from "./config/db.js";

async function check() {
  try {
    const [rows] = await db.promise().query("DESCRIBE verification");
    console.log("FIELDS IN verification:");
    rows.forEach((r) => console.log(r.Field));
  } catch (err) {
    console.error(err);
  }
  process.exit();
}
check();
