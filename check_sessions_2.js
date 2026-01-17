import db from "./config/db.js";
import fs from "fs";

async function checkSessions() {
  try {
    const [sessions] = await db
      .promise()
      .query(
        "SELECT sessionStatus, COUNT(*) as count FROM session GROUP BY sessionStatus",
      );
    const [recentSessions] = await db
      .promise()
      .query("SELECT date, sessionStatus FROM session WHERE studentId = 3");

    const result = {
      sessionStatuses: sessions,
      student3Sessions: recentSessions,
    };

    fs.writeFileSync("output_sessions.json", JSON.stringify(result, null, 2));
  } catch (err) {
    fs.writeFileSync("error_sessions.txt", err.stack);
  }
  process.exit();
}
checkSessions();
