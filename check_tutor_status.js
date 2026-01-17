import db from "./config/db.js";

async function check() {
  const [rows] = await db.promise().query(`
        SELECT t.userId, v.status 
        FROM tutor t 
        LEFT JOIN verification v ON t.verificationId = v.verificationId
    `);
  console.log("TUTOR STATUSES:", JSON.stringify(rows));
  process.exit();
}
check();
