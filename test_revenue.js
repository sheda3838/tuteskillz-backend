import db from "./config/db.js";

const query = `
    SELECT
      u.userId,
      u.fullName,
      u.profilePhoto,
      SUM(p.amount) AS totalRevenue
    FROM payment p
    JOIN session s ON p.sessionId = s.sessionId
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN users u ON t.userId = u.userId
    WHERE p.paymentStatus = 'Paid' 
      AND p.paidAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY t.userId, u.fullName, u.profilePhoto
    ORDER BY totalRevenue DESC
    LIMIT 5;
`;

db.query(query, (err, rows) => {
  if (err) {
    console.log("SQL ERROR:", err.message);
  } else {
    console.log("SUCCESS! Rows count:", rows.length);
  }
  process.exit();
});
