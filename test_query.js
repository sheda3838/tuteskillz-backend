import db from "./config/db.js";

const query = `
    SELECT
      u.userId,
      u.fullName,
      u.profilePhoto,
      COUNT(v.verificationId) AS verificationsHandled
    FROM admin a
    JOIN users u ON a.userId = u.userId
    LEFT JOIN verification v ON a.userId = v.verifiedByAdminId
    GROUP BY a.userId, u.fullName, u.profilePhoto
    ORDER BY verificationsHandled DESC;
`;

db.query(query, (err, rows) => {
  if (err) {
    console.log("SQL ERROR IS HERE:", err.message);
  } else {
    console.log("SUCCESS! Rows count:", rows.length);
  }
  process.exit();
});
