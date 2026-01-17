import db from "./config/db.js";

async function checkData() {
  try {
    const [sessions] = await db
      .promise()
      .query("SELECT COUNT(*) as count FROM session");
    console.log("TOTAL SESSIONS:", sessions[0].count);

    const [recentSessions] = await db
      .promise()
      .query(
        "SELECT COUNT(*) as count FROM session WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)",
      );
    console.log("SESSIONS IN LAST 30 DAYS:", recentSessions[0].count);

    const [tutors] = await db
      .promise()
      .query("SELECT COUNT(*) as count FROM tutor");
    console.log("TOTAL TUTORS:", tutors[0].count);

    const [students] = await db
      .promise()
      .query("SELECT userId, grade FROM student");
    console.log("STUDENTS GRADES:", JSON.stringify(students));

    const [grades] = await db
      .promise()
      .query("SELECT DISTINCT grade FROM tutorSubject");
    console.log(
      "TUTOR SUBJECTS GRADES:",
      JSON.stringify(grades.map((g) => g.grade)),
    );
  } catch (err) {
    console.error(err);
  }
  process.exit();
}
checkData();
