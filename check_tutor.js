import db from "./config/db.js";

async function check() {
  try {
    const [rows] = await db.promise().query("DESCRIBE tutor");
    console.log("FIELDS IN tutor:");
    rows.forEach((r) => console.log(r.Field + " " + r.Key));
  } catch (err) {
    console.error(err);
  }
  process.exit();
}
check();
