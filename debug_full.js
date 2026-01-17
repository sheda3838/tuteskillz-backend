import db from "./config/db.js";
import fs from "fs";

async function test() {
  const studentId = 3;
  try {
    const [gradeRows] = await db.promise().query(
      `
            SELECT ts.grade
            FROM session s
            JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
            WHERE s.studentId = ? AND s.sessionStatus = 'Completed'
            ORDER BY s.date DESC, s.startTime DESC
            LIMIT 1
        `,
      [studentId],
    );

    const grade = gradeRows.length > 0 ? gradeRows[0].grade : 6;

    const recSql = `
            SELECT 
                u.userId,
                u.fullName, 
                u.profilePhoto, 
                sub.subjectName,
                IFNULL(AVG(f.rating), 0) as rating
            FROM tutor t
            JOIN users u ON t.userId = u.userId
            JOIN tutorSubject ts ON t.userId = ts.tutorId
            JOIN subject sub ON ts.subjectId = sub.subjectId
            JOIN verification v ON t.verificationId = v.verificationId
            LEFT JOIN session s ON ts.tutorSubjectId = s.tutorSubjectId
            LEFT JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'student'
            WHERE ts.grade = ? AND v.status = 'Approved'
            GROUP BY u.userId, u.fullName, u.profilePhoto, sub.subjectName
            ORDER BY rating DESC
            LIMIT 5
        `;

    const [recs] = await db.promise().query(recSql, [grade]);

    fs.writeFileSync(
      "full_debug.json",
      JSON.stringify(
        {
          studentId,
          gradeFound: grade,
          recsCount: recs.length,
          recs: recs.map((r) => ({
            ...r,
            profilePhoto: r.profilePhoto ? "EXISTS" : "NULL",
          })),
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
