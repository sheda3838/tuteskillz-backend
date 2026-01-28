import { Router } from "express";
import db from "../config/db.js";
import { sendEmail } from "../utils/email.js";
import { generateEmailHTML } from "../utils/emailTemplate.js";

const adminRouter = Router();

// Get all tutors
adminRouter.get("/allTutors", (req, resp) => {
  const query = `
    SELECT 
      u.userId, 
      u.fullName,
      u.email,
      u.profilePhoto,
      v.verificationId,
      v.status AS verificationStatus,
      v.type AS verificationType
    FROM users u
    JOIN tutor t
     on u.userId = t.userId
    LEFT JOIN verification v 
      ON t.verificationId = v.verificationId 
      AND v.type = 'tutor'
    WHERE u.role = 'tutor'
    ORDER BY u.userId ASC
  `;

  db.query(query, (err, tutorRows) => {
    if (err)
      return resp.status(500).json({ success: false, message: err.message });
    return resp.status(200).json({ success: true, tutors: tutorRows || [] });
  });
});

// Get all students
adminRouter.get("/allStudents", (req, resp) => {
  const query = `
    SELECT 
      u.userId,
      u.fullName,
      u.email,
      u.profilePhoto,
      g.fullName AS guardianName
    FROM users u
    JOIN student s ON u.userId = s.userId
    JOIN guardian g ON s.guardianId = g.guardianId
    WHERE u.role = 'student'
    ORDER BY u.userId ASC
  `;

  db.query(query, (err, studentRows) => {
    if (err) {
      return resp.status(500).json({ success: false, message: err.message });
    }

    return resp
      .status(200)
      .json({ success: true, students: studentRows || [] });
  });
});

// Get all sessions (basic info)
adminRouter.get("/allSessions", (req, resp) => {
  const query = `
    SELECT 
      s.sessionId,
      s.date,
      s.sessionStatus,
      -- Get tutor name
      tu.fullName AS tutorName,
      -- Get student name
      su.fullName AS studentName
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN users tu ON t.userId = tu.userId
    JOIN student st ON s.studentId = st.userId
    JOIN users su ON st.userId = su.userId
    ORDER BY s.date DESC, s.startTime DESC
  `;

  db.query(query, (err, sessionRows) => {
    if (err) {
      return resp.status(500).json({ success: false, message: err.message });
    }

    return resp
      .status(200)
      .json({ success: true, sessions: sessionRows || [] });
  });
});

// Get all admins (basic info)
adminRouter.get("/allAdmins", (req, resp) => {
  const query = `
    SELECT 
      u.userId,
      u.fullName,
      u.email,
      u.phone,
      u.profilePhoto
    FROM users u
    JOIN admin a ON u.userId = a.userId
    ORDER BY u.userId ASC
  `;

  db.query(query, (err, adminRows) => {
    if (err) {
      return resp.status(500).json({ success: false, message: err.message });
    }

    return resp.status(200).json({ success: true, admins: adminRows || [] });
  });
});

adminRouter.get("/allNotes", (req, resp) => {
  const query = `
    SELECT
      n.noteId,
      n.sessionId,
      n.title,
      n.uploadedAt AS uploadedDate,
      tu.fullName AS tutorName
    FROM notes n
    JOIN session s ON n.sessionId = s.sessionId
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN users tu ON t.userId = tu.userId
    ORDER BY n.noteId ASC
  `;

  db.query(query, (err, rows) => {
    if (err)
      return resp.status(500).json({ success: false, message: err.message });

    return resp.status(200).json({ success: true, notes: rows || [] });
  });
});

// Get counts for dashboard
adminRouter.get("/counts", (req, resp) => {
  console.log("SESSION:", req.session);
  const query = `
    SELECT 
      (SELECT COUNT(*) FROM users WHERE role = 'tutor') AS tutorCount,
      (SELECT COUNT(*) FROM users WHERE role = 'student') AS studentCount,
      (SELECT COUNT(*) FROM users WHERE role = 'admin') AS adminCount,
      (SELECT COUNT(*) FROM session WHERE sessionStatus = 'Completed') AS sessionCount,
      (SELECT COUNT(*) FROM notes) AS notesCount
  `;

  db.query(query, (err, rows) => {
    if (err) {
      return resp.status(500).json({ success: false, message: err.message });
    }

    // rows[0] will have all counts
    return resp.status(200).json({ success: true, counts: rows[0] });
  });
});

// Extract subjects table from tutor transcripts
adminRouter.post("/tutor/parse-text", async (req, resp) => {
  const { transcriptText } = req.body;

  if (!transcriptText) {
    return resp
      .status(400)
      .json({ success: false, message: "No transcript text provided" });
  }

  const lines = transcriptText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "SUBJECT GRADE DEFINITION");

  const results = lines
    .map((line) => {
      const match = line.match(/^(.+?)\s+([A-CFSW])\s+(.+)$/i);

      if (match) {
        return {
          subject: match[1].trim(),
          grade: match[2].trim(),
        };
      }
      return null;
    })
    .filter(Boolean);

  return resp.json({ success: true, results });
});

adminRouter.post("/tutor/save-results/:tutorId/:examType", (req, res) => {
  const { tutorId, examType } = req.params;
  const { results } = req.body;

  if (!results || !Array.isArray(results) || results.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "No results provided" });
  }

  if (!["OL", "AL"].includes(examType)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid exam type" });
  }

  db.beginTransaction((err) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    // Delete old results
    db.query(
      "DELETE FROM examResults WHERE tutorId = ? AND examType = ?",
      [tutorId, examType],
      (err) => {
        if (err)
          return db.rollback(() =>
            res.status(500).json({ success: false, message: err.message }),
          );

        const insertNext = (index) => {
          if (index >= results.length) {
            return db.commit((err) => {
              if (err)
                return db.rollback(() =>
                  res
                    .status(500)
                    .json({ success: false, message: err.message }),
                );
              return res.json({
                success: true,
                message: `${examType} results saved successfully`,
              });
            });
          }

          const { subject, grade } = results[index];
          const subjectName = subject.trim().toUpperCase();
          const examGrade = grade.trim().toUpperCase();

          // Check subject exists
          db.query(
            "SELECT subjectId FROM subject WHERE subjectName = ?",
            [subjectName],
            (err, rows) => {
              if (err)
                return db.rollback(() =>
                  res
                    .status(500)
                    .json({ success: false, message: err.message }),
                );

              const insertExamResult = (subjectId) => {
                db.query(
                  "INSERT INTO examResults (examType, grade, tutorId, subjectId) VALUES (?,?,?,?)",
                  [examType, examGrade, tutorId, subjectId],
                  (err) => {
                    if (err)
                      return db.rollback(() =>
                        res
                          .status(500)
                          .json({ success: false, message: err.message }),
                      );
                    insertNext(index + 1);
                  },
                );
              };

              if (rows.length > 0) {
                insertExamResult(rows[0].subjectId);
              } else {
                db.query(
                  "INSERT INTO subject (subjectName) VALUES (?)",
                  [subjectName],
                  (err, result) => {
                    if (err)
                      return db.rollback(() =>
                        res
                          .status(500)
                          .json({ success: false, message: err.message }),
                      );
                    insertExamResult(result.insertId);
                  },
                );
              }
            },
          );
        };

        insertNext(0); // start recursion
      },
    );
  });
});

adminRouter.post("/tutor/approve/:tutorId", (req, res) => {
  const { tutorId } = req.params;
  const { adminId, verifiedNotes } = req.body;

  if (!adminId)
    return res
      .status(400)
      .json({ success: false, message: "Admin ID required" });

  db.beginTransaction((err) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    db.query(
      "INSERT INTO verification (verifiedByAdminId, status, type, verifiedNotes) VALUES (?,?,?,?)",
      [adminId, "Approved", "tutor", verifiedNotes || ""],
      (err, verResult) => {
        if (err)
          return db.rollback(() =>
            res.status(500).json({ success: false, message: err.message }),
          );

        const verificationId = verResult.insertId;

        db.query(
          "UPDATE tutor SET verificationId = ? WHERE userId = ?",
          [verificationId, tutorId],
          async (err) => {
            if (err)
              return db.rollback(() =>
                res.status(500).json({ success: false, message: err.message }),
              );

            db.commit(async (err) => {
              if (err)
                return db.rollback(() =>
                  res
                    .status(500)
                    .json({ success: false, message: err.message }),
                );

              // ✅ Fetch tutor email
              try {
                const [rows] = await db
                  .promise()
                  .query("SELECT email, fullName FROM users WHERE userId = ?", [
                    tutorId,
                  ]);
                const tutorEmail = rows[0]?.email;
                const tutorName = rows[0]?.fullName || "Tutor";

                if (tutorEmail) {
                  const emailHtml = generateEmailHTML({
                    title: `Congratulations, ${tutorName}!`,
                    message:
                      "Your tutor application has been approved by our admin.",
                    buttonText: "Go to Login",
                    buttonUrl: `${process.env.FRONTEND_URL}signin`,
                    additionalNotes: verifiedNotes
                      ? `Notes from admin: ${verifiedNotes}`
                      : "",
                  });
                  await sendEmail(
                    tutorEmail,
                    "Tutor Application Approved",
                    emailHtml,
                  );
                }
              } catch (emailErr) {
                console.error("Error sending approval email:", emailErr);
              }

              return res.json({
                success: true,
                message: "Tutor approved successfully",
                verificationId,
              });
            });
          },
        );
      },
    );
  });
});

// adminRouter.js

// Reject Tutor Route
adminRouter.post("/reject-tutor/:tutorId", (req, res) => {
  const { tutorId } = req.params;
  const { note, adminId } = req.body;

  if (!adminId)
    return res
      .status(400)
      .json({ success: false, message: "Admin ID required" });

  db.beginTransaction((err) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    // Insert verification record as Rejected
    db.query(
      "INSERT INTO verification (verifiedByAdminId, status, type, verifiedNotes) VALUES (?,?,?,?)",
      [adminId, "Rejected", "tutor", note || ""],
      (err, verResult) => {
        if (err)
          return db.rollback(() =>
            res.status(500).json({ success: false, message: err.message }),
          );

        const verificationId = verResult.insertId;

        // Update tutor with verificationId
        db.query(
          "UPDATE tutor SET verificationId = ? WHERE userId = ?",
          [verificationId, tutorId],
          (err) => {
            if (err)
              return db.rollback(() =>
                res.status(500).json({ success: false, message: err.message }),
              );

            db.commit((err) => {
              if (err)
                return db.rollback(() =>
                  res
                    .status(500)
                    .json({ success: false, message: err.message }),
                );

              // Fetch tutor email and send rejection email
              db.query(
                "SELECT email FROM users WHERE userId = ?",
                [tutorId],
                (err, rows) => {
                  if (!err && rows.length > 0) {
                    const tutorEmail = rows[0].email;
                    const emailHtml = generateEmailHTML({
                      title: "Tutor Application Rejected",
                      message:
                        "Unfortunately, your application has been rejected.",
                      additionalNotes: note || "",
                    });

                    sendEmail(
                      tutorEmail,
                      "Tutor Application Rejected",
                      emailHtml,
                    );
                  }
                  // Return response regardless of email success/failure
                  return res.json({
                    success: true,
                    message: "Tutor rejected successfully",
                    verificationId,
                  });
                },
              );
            });
          },
        );
      },
    );
  });
});
// --------------------------------------------------------------------------------
// ADMIN DASHBOARD REPORTS
// --------------------------------------------------------------------------------

// 1. Best Tutors
adminRouter.get("/reports/best-tutors", (req, res) => {
  const query = `
    SELECT
      u.userId,
      u.fullName,
      u.profilePhoto,
      u.email,
      COUNT(DISTINCT s.sessionId) AS completedSessions,
      IFNULL(AVG(f.rating), 0) AS averageRating,
      -- Simple Rank Score: (AvgRating * 10) + (CompletedSessions * 2)
      ((IFNULL(AVG(f.rating), 0) * 10) + (COUNT(DISTINCT s.sessionId) * 2)) AS rankScore
    FROM tutor t
    JOIN users u ON t.userId = u.userId
    LEFT JOIN tutorSubject ts ON t.userId = ts.tutorId
    LEFT JOIN session s ON ts.tutorSubjectId = s.tutorSubjectId AND s.sessionStatus = 'Completed'
    LEFT JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'student'
    GROUP BY u.userId, u.fullName, u.profilePhoto, u.email
    ORDER BY rankScore DESC
    LIMIT 5;
  `;

  db.query(query, (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, data: rows });
  });
});

// 2. Top 5 Tutors by Revenue (Last 30 days)
adminRouter.get("/reports/top-revenue-tutors", (req, res) => {
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
    GROUP BY u.userId, u.fullName, u.profilePhoto
    ORDER BY totalRevenue DESC
    LIMIT 5;
  `;

  db.query(query, (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, data: rows });
  });
});

// 3. Highest Revenue Subject (Last 30 days)
adminRouter.get("/reports/top-subject-revenue", (req, res) => {
  const query = `
    SELECT
      sub.subjectName,
      SUM(p.amount) AS totalRevenue
    FROM payment p
    JOIN session s ON p.sessionId = s.sessionId
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN subject sub ON ts.subjectId = sub.subjectId
    WHERE p.paymentStatus = 'Paid' 
      AND p.paidAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY sub.subjectId, sub.subjectName
    ORDER BY totalRevenue DESC
    LIMIT 5;
  `;

  db.query(query, (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, data: rows });
  });
});

// 4. Most Active Students
adminRouter.get("/reports/most-active-students", (req, res) => {
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
    GROUP BY u.userId, u.fullName, u.profilePhoto, u.email
    ORDER BY sessionsJoined DESC
    LIMIT 5;
  `;

  db.query(query, (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, data: rows });
  });
});

// 5. Admin Workload
adminRouter.get("/reports/admin-workload", (req, res) => {
  const query = `
    SELECT
      u.userId,
      u.fullName,
      u.profilePhoto,
      COUNT(v.verificationId) AS verificationsHandled
    FROM admin a
    JOIN users u ON a.userId = u.userId
    LEFT JOIN verification v ON a.userId = v.verifiedByAdminId
    GROUP BY u.userId, u.fullName, u.profilePhoto
    ORDER BY verificationsHandled DESC;
  `;

  db.query(query, (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, data: rows });
  });
});

// 6. Weekly Ratings & Feedback Analytics
adminRouter.get("/reports/weekly-feedback-analytics", (req, res) => {
  // Common time filter: Last 7 days
  const TIME_FILTER = "s.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)";

  // A. Lowest Rated Tutor
  const lowestTutorQuery = `
    SELECT 
      u.fullName,
      u.email,
      IFNULL(AVG(f.rating), 0) as avgRating,
      COUNT(s.sessionId) as count
    FROM tutor t
    JOIN users u ON t.userId = u.userId
    JOIN tutorSubject ts ON t.userId = ts.tutorId
    JOIN session s ON ts.tutorSubjectId = s.tutorSubjectId
    JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'student'
    WHERE ${TIME_FILTER} 
      AND s.sessionStatus = 'Completed'
    GROUP BY t.userId, u.fullName, u.email
    HAVING avgRating > 0
    ORDER BY avgRating ASC
    LIMIT 1
  `;

  // B. Lowest Rated Subject
  const lowestSubjectQuery = `
    SELECT 
      sub.subjectName,
      IFNULL(AVG(f.rating), 0) as avgRating,
      COUNT(s.sessionId) as count
    FROM subject sub
    JOIN tutorSubject ts ON sub.subjectId = ts.subjectId
    JOIN session s ON ts.tutorSubjectId = s.tutorSubjectId
    JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'student'
    WHERE ${TIME_FILTER}
      AND s.sessionStatus = 'Completed'
    GROUP BY sub.subjectId, sub.subjectName
    HAVING avgRating > 0
    ORDER BY avgRating ASC
    LIMIT 1
  `;

  // C. Lowest Rated Session (Single worst session)
  const lowestSessionQuery = `
    SELECT 
      s.sessionId,
      u.fullName as tutorName,
      sub.subjectName,
      f.rating,
      f.comments
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN users u ON t.userId = u.userId
    JOIN subject sub ON ts.subjectId = sub.subjectId
    JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'student'
    WHERE ${TIME_FILTER}
      AND s.sessionStatus = 'Completed'
    ORDER BY f.rating ASC
    LIMIT 1
  `;

  // D. Recent Negative Feedback (Rating <= 3)
  const negativeFeedbackQuery = `
    SELECT 
      s.sessionId,
      u.fullName as tutorName,
      sub.subjectName,
      f.rating,
      f.comments,
      s.date
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN users u ON t.userId = u.userId
    JOIN subject sub ON ts.subjectId = sub.subjectId
    JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'student'
    WHERE ${TIME_FILTER}
      AND s.sessionStatus = 'Completed'
      AND f.rating <= 3
    ORDER BY s.date DESC, s.startTime DESC
    LIMIT 5
  `;

  db.query(lowestTutorQuery, (err1, tutorRows) => {
    if (err1)
      return res.status(500).json({ success: false, message: err1.message });

    db.query(lowestSubjectQuery, (err2, subjectRows) => {
      if (err2)
        return res.status(500).json({ success: false, message: err2.message });

      db.query(lowestSessionQuery, (err3, sessionRows) => {
        if (err3)
          return res
            .status(500)
            .json({ success: false, message: err3.message });

        db.query(negativeFeedbackQuery, (err4, feedbackRows) => {
          if (err4)
            return res
              .status(500)
              .json({ success: false, message: err4.message });

          res.json({
            success: true,
            data: {
              lowestTutor: tutorRows[0] || null,
              lowestSubject: subjectRows[0] || null,
              lowestSession: sessionRows[0] || null,
              negativeFeedback: feedbackRows || [],
            },
          });
        });
      });
    });
  });
});

export default adminRouter;
