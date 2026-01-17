import { Router } from "express";
import db from "../config/db.js";
import { base64ToBuffer } from "../utils/fileHelper.js";

const studentRouter = Router();

studentRouter.post("/register", (req, resp) => {
  const {
    email,
    fullName,
    gender,
    dob,
    phone,
    grade,
    gFullName,
    gEmail,
    gPhone,
    street,
    city,
    province,
    postalCode,
    profilePic,
  } = req.body;

  if (!email) {
    return resp
      .status(401)
      .json({ success: false, message: "Unauthorized: No email in session" });
  }

  // start transaction
  db.beginTransaction((err) => {
    if (err)
      return resp.status(500).json({ success: false, message: err.message });

    // 1️⃣ get password from tempUsers
    db.query(
      "SELECT password FROM tempUsers WHERE email = ?",
      [email],
      (err, tempUserRows) => {
        if (err)
          return db.rollback(() =>
            resp.status(500).json({ success: false, message: err.message }),
          );
        if (tempUserRows.length === 0)
          return db.rollback(() =>
            resp
              .status(404)
              .json({ success: false, message: "User not found" }),
          );

        const password = tempUserRows[0].password ?? null;

        // 2️⃣ insert address
        db.query(
          "INSERT INTO address (street, city, province, postalCode) VALUES (?,?,?,?)",
          [street, city, province, postalCode],
          (err, addressResult) => {
            if (err)
              return db.rollback(() =>
                resp.status(500).json({ success: false, message: err.message }),
              );

            const addressId = addressResult.insertId;

            // 3️⃣ insert guardian
            db.query(
              "INSERT INTO guardian (fullName, email, phone) VALUES (?,?,?)",
              [gFullName, gEmail, gPhone],
              (err, guardianResult) => {
                if (err)
                  return db.rollback(() =>
                    resp
                      .status(500)
                      .json({ success: false, message: err.message }),
                  );

                const guardianId = guardianResult.insertId;

                // 4️⃣ insert user
                db.query(
                  "INSERT INTO users (fullName, gender, dob, phone, addressId, email, password, role, profilePhoto) VALUES (?,?,?,?,?,?,?,?,?)",
                  [
                    fullName,
                    gender,
                    dob,
                    phone,
                    addressId,
                    email,
                    password,
                    "student",
                    base64ToBuffer(profilePic) || null,
                  ],
                  (err, userResult) => {
                    if (err)
                      return db.rollback(() =>
                        resp
                          .status(500)
                          .json({ success: false, message: err.message }),
                      );

                    const userId = userResult.insertId;

                    // 5️⃣ insert student
                    db.query(
                      "INSERT INTO student (userId, guardianId, grade) VALUES (?,?, ?)",
                      [userId, guardianId, grade],
                      (err, studentResult) => {
                        if (err)
                          return db.rollback(() =>
                            resp
                              .status(500)
                              .json({ success: false, message: err.message }),
                          );

                        // ✅ commit transaction
                        db.commit((err) => {
                          if (err)
                            return db.rollback(() =>
                              resp
                                .status(500)
                                .json({ success: false, message: err.message }),
                            );

                          return resp.json({
                            success: true,
                            message: "Student registered successfully",
                          });
                        });
                      },
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  });
});

// ============================
// 1️⃣ Get available mediums
// ============================
studentRouter.get("/tutors/mediums", (req, resp) => {
  const sql = `
    SELECT DISTINCT ts.teachingMedium
    FROM tutorSubject ts
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN verification v ON t.verificationId = v.verificationId
    WHERE v.status = 'Approved'
  `;
  db.query(sql, (err, rows) => {
    if (err)
      return resp.status(500).json({ success: false, message: err.message });
    const mediums = rows.map((r) => r.teachingMedium);
    resp.json({ success: true, data: mediums });
  });
});

// ============================
// 2️⃣ Get grades by medium
// ============================
studentRouter.get("/tutors/grades", (req, resp) => {
  const { medium } = req.query;
  if (!medium)
    return resp
      .status(400)
      .json({ success: false, message: "Medium is required" });

  const sql = `
    SELECT DISTINCT ts.grade
    FROM tutorSubject ts
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN verification v ON t.verificationId = v.verificationId
    WHERE ts.teachingMedium = ? AND v.status = 'Approved'
    ORDER BY ts.grade
  `;
  db.query(sql, [medium], (err, rows) => {
    if (err)
      return resp.status(500).json({ success: false, message: err.message });
    const grades = rows.map((r) => r.grade);
    resp.json({ success: true, data: grades });
  });
});

// ============================
// 3️⃣ Get subjects by medium + grade
// ============================
studentRouter.get("/tutors/subjects", (req, resp) => {
  const { medium, grade } = req.query;
  if (!medium || !grade)
    return resp
      .status(400)
      .json({ success: false, message: "Medium and grade are required" });

  const sql = `
    SELECT DISTINCT s.subjectId, s.subjectName
    FROM tutorSubject ts
    JOIN subject s ON ts.subjectId = s.subjectId
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN verification v ON t.verificationId = v.verificationId
    WHERE ts.teachingMedium = ? AND ts.grade = ? AND v.status = 'Approved'
  `;
  db.query(sql, [medium, grade], (err, rows) => {
    if (err)
      return resp.status(500).json({ success: false, message: err.message });
    resp.json({ success: true, data: rows });
  });
});

// ============================
// 4️⃣ Get tutors by medium + grade + subject
// ============================
studentRouter.get("/tutors", (req, resp) => {
  const { medium, grade, subjectId } = req.query;
  if (!medium || !grade || !subjectId)
    return resp.status(400).json({
      success: false,
      message: "Medium, grade, and subjectId are required",
    });

  const sql = `
  SELECT ts.tutorSubjectId, u.userId, u.fullName, u.profilePhoto, t.bio
  FROM tutorSubject ts
  JOIN tutor t ON ts.tutorId = t.userId
  JOIN users u ON t.userId = u.userId
  JOIN verification v ON t.verificationId = v.verificationId
  WHERE ts.teachingMedium = ? AND ts.grade = ? AND ts.subjectId = ? AND v.status = 'Approved'
`;

  db.query(sql, [medium, grade, subjectId], (err, rows) => {
    if (err)
      return resp.status(500).json({ success: false, message: err.message });
    resp.json({ success: true, data: rows });
  });
});

// ============================
// 5️⃣ Get student details by student ID
// ============================
studentRouter.get("/:studentId", (req, resp) => {
  const { studentId } = req.params;
  if (!studentId) {
    return resp
      .status(400)
      .json({ success: false, message: "Student ID is required" });
  }

  const sql = `
    SELECT 
      u.fullName, 
      u.profilePhoto, 
      u.email, 
      u.phone, 
      a.city, 
      a.street
    FROM users u
    LEFT JOIN address a ON u.addressId = a.addressId
    WHERE u.userId = ?
  `;

  db.query(sql, [studentId], (err, rows) => {
    if (err)
      return resp.status(500).json({ success: false, message: err.message });
    if (rows.length === 0) {
      return resp
        .status(404)
        .json({ success: false, message: "Student not found" });
    }
    resp.json({ success: true, data: rows[0] });
  });
});

// ============================
// 6️⃣ Student Dashboard Stats
// ============================
studentRouter.get("/dashboard/:studentId", (req, res) => {
  const { studentId } = req.params;

  if (!studentId)
    return res
      .status(400)
      .json({ success: false, message: "Student ID required" });

  // 1. Overall Stats
  const overallQuery = `
    SELECT 
      COUNT(s.sessionId) as totalSessions, 
      IFNULL(AVG(f.rating), 0) as avgRating
    FROM session s
    LEFT JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'tutor'
    WHERE s.studentId = ? AND s.sessionStatus = 'Completed'
  `;

  // 2. Learning Performance (Subject-wise)
  const subjectQuery = `
    SELECT 
      sub.subjectName, 
      COUNT(s.sessionId) as totalSessions, 
      IFNULL(AVG(f.rating), 0) as avgRating
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN subject sub ON ts.subjectId = sub.subjectId
    LEFT JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'tutor'
    WHERE s.studentId = ? AND s.sessionStatus = 'Completed'
    GROUP BY sub.subjectName
  `;

  // 3. Peak Learning Times
  const peakTimeQuery = `
    SELECT 
      s.startTime, 
      COUNT(s.sessionId) as sessionCount
    FROM session s
    WHERE s.studentId = ? AND s.sessionStatus = 'Completed'
    GROUP BY s.startTime
    ORDER BY sessionCount DESC
    LIMIT 5
  `;

  // 4. Learning Trends (Last 7 Days)
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

  // 5. Recommended Tutors (Based on grade of most recent session)
  // First, get the grade
  const gradeQuery = `
    SELECT ts.grade
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    WHERE s.studentId = ? AND s.sessionStatus = 'Completed'
    ORDER BY s.date DESC, s.startTime DESC
    LIMIT 1
  `;

  db.query(overallQuery, [studentId], (err, overallRows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    db.query(subjectQuery, [studentId], (err2, subjectRows) => {
      if (err2)
        return res.status(500).json({ success: false, message: err2.message });

      db.query(peakTimeQuery, [studentId], (err3, peakRows) => {
        if (err3)
          return res
            .status(500)
            .json({ success: false, message: err3.message });

        db.query(trendsQuery, [studentId], (err4, trendRows) => {
          if (err4)
            return res
              .status(500)
              .json({ success: false, message: err4.message });

          // Mock Trends Data with random values for Pie Chart
          const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const processedTrends = days.map((day) => ({
            day: day,
            sessionCount: Math.floor(Math.random() * 20) + 5, // Random value between 5-25
          }));

          // Recommended Tutors Logic
          db.query(gradeQuery, [studentId], (err5, gradeRows) => {
            // If error or no recent sessions, we can't recommend based on grade easily,
            // or could fallback to student's registered grade if we stored it (we do in student table).
            // For now, if no session, just return empty recommendations or generic.
            const studentGrade =
              gradeRows.length > 0 ? gradeRows[0].grade : null;

            if (!studentGrade) {
              // Fallback: try getting grade from student table
              const fallbackSql = "SELECT grade FROM student WHERE userId = ?";
              db.query(fallbackSql, [studentId], (err6, fbRows) => {
                if (err6 || fbRows.length === 0) {
                  // No grade found at all, return data without recommendations
                  return res.json({
                    success: true,
                    data: {
                      overall: overallRows[0],
                      subjects: subjectRows,
                      peakTimes: peakRows,
                      trends: processedTrends,
                      recommendations: [],
                    },
                  });
                }
                fetchRecommendations(fbRows[0].grade);
              });
            } else {
              fetchRecommendations(studentGrade);
            }

            function fetchRecommendations(grade) {
              // Find top rated tutors for this grade
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

              db.query(recSql, [grade], (errRec, recRows) => {
                if (errRec) {
                  // non-critical failure, return empty
                  return res.json({
                    success: true,
                    data: {
                      overall: overallRows[0],
                      subjects: subjectRows,
                      peakTimes: peakRows,
                      trends: processedTrends,
                      recommendations: [],
                    },
                  });
                }

                const processedRecommendations = recRows.map((row) => ({
                  ...row,
                  profilePhoto: row.profilePhoto
                    ? row.profilePhoto.toString("base64")
                    : null,
                }));

                res.json({
                  success: true,
                  data: {
                    overall: {
                      totalSessions: Number(overallRows[0].totalSessions),
                      avgRating: Number(overallRows[0].avgRating),
                    },
                    subjects: subjectRows.map((s) => ({
                      ...s,
                      totalSessions: Number(s.totalSessions),
                      avgRating: Number(s.avgRating),
                    })),
                    peakTimes: peakRows.map((p) => ({
                      ...p,
                      sessionCount: Number(p.sessionCount),
                    })),
                    trends: processedTrends,
                    recommendations: processedRecommendations,
                  },
                });
              });
            }
          });
        });
      });
    });
  });
});

export default studentRouter;
