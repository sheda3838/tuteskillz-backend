import db from "./config/db.js";
import fs from "fs";

async function test() {
  const studentId = 3;
  const trendsQuery = `
        SELECT 
          DAYOFWEEK(s.date) as dayIdx, 
          COUNT(s.sessionId) as sessionCount
        FROM session s
        WHERE s.studentId = ? 
          AND s.sessionStatus IN ('Completed', 'Paid', 'Accepted') 
          AND s.date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
        GROUP BY dayIdx
        ORDER BY dayIdx ASC
    `;

  try {
    const [rows] = await db.promise().query(trendsQuery, [studentId]);
    const [sessions] = await db
      .promise()
      .query("SELECT date, sessionStatus FROM session WHERE studentId = 3");

    fs.writeFileSync(
      "trends_debug.json",
      JSON.stringify(
        {
          trends: rows,
          sessions: sessions,
          curdate: await db
            .promise()
            .query("SELECT CURDATE()")
            .then((r) => r[0][0]),
        },
        null,
        2,
      ),
    );
  } catch (err) {
    fs.writeFileSync("error.txt", err.stack);
  }
  process.exit();
}
test();
