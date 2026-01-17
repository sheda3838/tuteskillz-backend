import db from "./config/db.js";
import fs from "fs";

async function checkSessions() {
  try {
    const [sessions] = await db
      .promise()
      .query("SELECT date, studentId FROM session ORDER BY date DESC LIMIT 20");
    const [tutors] = await db
      .promise()
      .query(
        "SELECT t.userId, ts.grade FROM tutor t JOIN tutorSubject ts ON t.userId = ts.tutorId LIMIT 20",
      );
    const [students] = await db
      .promise()
      .query("SELECT userId, grade FROM student");

    const result = {
      sessions,
      tutors,
      students,
    };

    fs.writeFileSync("output.json", JSON.stringify(result, null, 2));
  } catch (err) {
    fs.writeFileSync("error.txt", err.stack);
  }
  process.exit();
}
checkSessions();
