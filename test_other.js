import db from "./config/db.js";

const query = `
    SELECT
      u.userId,
      u.fullName,
      u.profilePhoto,
      u.email,
      COUNT(DISTINCT s.sessionId) AS sessionsJoined,
      IFNULL(AVG(f.rating), 0) AS avgGivenRating
    FROM student st
    JOIN users u ON st.userId = u.userId
    JOIN session s ON st.userId = s.studentId
    LEFT JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'student'
    WHERE s.sessionStatus IN ('Completed', 'Paid', 'Accepted')
    GROUP BY st.userId, u.fullName, u.profilePhoto, u.email
    ORDER BY sessionsJoined DESC
    LIMIT 5;
`;

db.query(query, (err, rows) => {
  if (err) {
    console.error("SQL ERROR:", err.message);
  } else {
    console.log("SUCCESS! Rows count:", rows.length);
  }
  process.exit();
});
