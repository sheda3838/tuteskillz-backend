import db from "./config/db.js";

const grade = 6;
const recSql = `
    SELECT 
        u.fullName, 
        u.profilePhoto, 
        sub.subjectName,
        IFNULL(AVG(f.rating), 0) as rating
    FROM tutor t
    JOIN users u ON t.userId = u.userId
    JOIN tutorSubject ts ON t.userId = ts.tutorId
    JOIN subject sub ON ts.subjectId = sub.subjectId
    LEFT JOIN session s ON ts.tutorSubjectId = s.tutorSubjectId
    LEFT JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'student'
    WHERE ts.grade = ?
    GROUP BY u.userId, u.fullName, u.profilePhoto, sub.subjectName
    ORDER BY rating DESC
    LIMIT 5
`;

db.query(recSql, [grade], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log("REC ROWS:", JSON.stringify(rows));
  }
  process.exit();
});
