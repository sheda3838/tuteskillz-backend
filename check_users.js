import db from "./config/db.js";

async function test() {
  const [rows] = await db.promise().query("DESCRIBE users");
  console.log("USERS SCHEMA:", JSON.stringify(rows));
  process.exit();
}
test();
