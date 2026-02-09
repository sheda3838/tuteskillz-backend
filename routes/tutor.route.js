import { Router } from "express";
import db from "../config/db.js";
import { base64ToBuffer } from "../utils/fileHelper.js";

const tutorRouter = Router();

tutorRouter.post("/register", (req, res) => {
  const {
    email,
    fullName,
    gender,
    dob,
    phone,
    street,
    city,
    province,
    postalCode,
    school,
    university,
    bio,
    profilePic,
    olTranscript,
    alTranscript,
    teachingSubjects, // array of { subjectId, grade, teachingMedium }
  } = req.body;

  if (!email) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: No email in session" });
  }

  db.beginTransaction((err) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    // 1️⃣ Get password from tempUsers
    db.query(
      "SELECT password FROM tempUsers WHERE email = ?",
      [email],
      (err, tempRows) => {
        if (err)
          return db.rollback(() =>
            res.status(500).json({ success: false, message: err.message }),
          );
        if (tempRows.length === 0)
          return db.rollback(() =>
            res
              .status(404)
              .json({ success: false, message: "User not found in tempUsers" }),
          );

        const password = tempRows[0].password ?? null;

        // 2️⃣ Insert address
        db.query(
          "INSERT INTO address (street, city, province, postalCode) VALUES (?,?,?,?)",
          [street, city, province, postalCode],
          (err, addressResult) => {
            if (err)
              return db.rollback(() =>
                res.status(500).json({ success: false, message: err.message }),
              );

            const addressId = addressResult.insertId;
            // 3️⃣ Insert user
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
                "tutor",
                base64ToBuffer(profilePic) || null,
              ],
              (err, userResult) => {
                if (err)
                  return db.rollback(() =>
                    res
                      .status(500)
                      .json({ success: false, message: err.message }),
                  );

                const userId = userResult.insertId;

                // 4️⃣ Insert tutor
                db.query(
                  "INSERT INTO tutor (userId, school, university, bio, olTranscript, alTranscript) VALUES (?,?,?,?,?,?)",
                  [
                    userId,
                    school,
                    university,
                    bio,
                    base64ToBuffer(olTranscript) || null,
                    base64ToBuffer(alTranscript) || null,
                  ],
                  (err) => {
                    if (err)
                      return db.rollback(() =>
                        res
                          .status(500)
                          .json({ success: false, message: err.message }),
                      );

                    const subjects = Array.isArray(teachingSubjects)
                      ? teachingSubjects
                      : [];

                    // 5️⃣ Insert subjects sequentially
                    const insertSubject = (index) => {
                      if (index >= subjects.length) {
                        // ✅ commit transaction
                        return db.commit((err) => {
                          if (err)
                            return db.rollback(() =>
                              res
                                .status(500)
                                .json({ success: false, message: err.message }),
                            );
                          return res.json({
                            success: true,
                            message: "Tutor registered successfully",
                          });
                        });
                      }

                      const { subjectId, grade, medium } = subjects[index];
                      db.query(
                        "INSERT INTO tutorSubject (tutorId, subjectId, grade, teachingMedium) VALUES (?,?,?,?)",
                        [userId, subjectId, grade, medium],
                        (err) => {
                          if (err)
                            return db.rollback(() =>
                              res
                                .status(500)
                                .json({ success: false, message: err.message }),
                            );
                          insertSubject(index + 1); // insert next
                        },
                      );
                    };

                    if (subjects.length > 0) {
                      insertSubject(0); // start recursion
                    } else {
                      // no subjects, commit immediately
                      db.commit((err) => {
                        if (err)
                          return db.rollback(() =>
                            res
                              .status(500)
                              .json({ success: false, message: err.message }),
                          );
                        return res.json({
                          success: true,
                          message:
                            "Tutor registered successfully (no subjects)",
                        });
                      });
                    }
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

tutorRouter.post("/availability", (req, res) => {
  const { tutorId, availability } = req.body;

  if (!tutorId || !Array.isArray(availability)) {
    return res.status(400).json({
      success: false,
      message: "tutorId and availability[] are required",
    });
  }

  // Each availability item: { dayOfWeek, startTime, endTime }
  db.beginTransaction((err) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    const insertNext = (i) => {
      if (i >= availability.length) {
        return db.commit((err) => {
          if (err)
            return db.rollback(() =>
              res.status(500).json({ success: false, message: err.message }),
            );
          return res.json({
            success: true,
            message: "Availability saved successfully",
          });
        });
      }

      const { dayOfWeek, startTime, endTime } = availability[i];

      // Validate input
      if (!dayOfWeek || !startTime || !endTime) {
        return db.rollback(() =>
          res.status(400).json({
            success: false,
            message: "Invalid availability entry",
          }),
        );
      }

      db.query(
        `INSERT INTO tutorAvailability (tutorId, dayOfWeek, startTime, endTime) 
         VALUES (?, ?, ?, ?)`,
        [tutorId, dayOfWeek, startTime, endTime],
        (err) => {
          if (err)
            return db.rollback(() =>
              res.status(500).json({ success: false, message: err.message }),
            );

          insertNext(i + 1);
        },
      );
    };

    insertNext(0);
  });
});

tutorRouter.get("/availability/:tutorId", (req, res) => {
  const tutorId = req.params.tutorId;

  db.query(
    "SELECT * FROM tutorAvailability WHERE tutorId = ? ORDER BY FIELD(dayOfWeek,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), startTime",
    [tutorId],
    (err, rows) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });

      res.json({
        success: true,
        availability: rows,
      });
    },
  );
});

tutorRouter.get("/status/:id", (req, res) => {
  const tutorId = req.params.id;

  const query = `
    SELECT
      t.verificationId,
      v.status AS verificationStatus,
      (SELECT COUNT(*) FROM tutorAvailability WHERE tutorId = t.userId) AS availabilityCount,
      (SELECT COUNT(*) FROM bankDetails WHERE tutorId = t.userId) AS bankCount
    FROM tutor t
    LEFT JOIN verification v ON t.verificationId = v.verificationId
    WHERE t.userId = ?
  `;

  db.query(query, [tutorId], (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Tutor not found" });
    }

    const { verificationId, verificationStatus, availabilityCount, bankCount } =
      rows[0];

    // Case 1: Pending verification
    if (!verificationId) {
      return res.json({
        success: true,
        status: "pending_verification",
        details: {
          hasAvailability: false,
          hasBankDetails: false,
          verificationId: null,
          verificationStatus: null,
        },
      });
    }

    // Case 2: Rejected
    if (verificationStatus === "Rejected") {
      return res.json({
        success: true,
        status: "verification_rejected",
        details: {
          hasAvailability: false,
          hasBankDetails: false,
          verificationId,
          verificationStatus,
        },
      });
    }

    // Case 3: Approved, check availability & bank
    const hasAvailability = availabilityCount > 0;
    const hasBankDetails = bankCount > 0;

    if (!hasAvailability || !hasBankDetails) {
      return res.json({
        success: true,
        status: "incomplete",
        details: {
          hasAvailability,
          hasBankDetails,
          verificationId,
          verificationStatus,
        },
      });
    }

    // Case 4: Everything done
    return res.json({
      success: true,
      status: "complete",
      details: {
        hasAvailability,
        hasBankDetails,
        verificationId,
        verificationStatus,
      },
    });
  });
});

tutorRouter.post("/bank-details", (req, res) => {
  const { tutorId, accounts } = req.body;

  if (!tutorId || !Array.isArray(accounts) || accounts.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "tutorId and accounts[] are required" });
  }

  // Ensure at least one primary account
  const hasPrimary = accounts.some((acc) => acc.isPrimary);
  if (!hasPrimary) {
    return res.status(400).json({
      success: false,
      message: "At least one account must be marked as primary.",
    });
  }

  db.beginTransaction((err) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    const insertNext = (i) => {
      if (i >= accounts.length) {
        // commit transaction
        return db.commit((err) => {
          if (err)
            return db.rollback(() =>
              res.status(500).json({ success: false, message: err.message }),
            );
          return res.json({
            success: true,
            message: "Bank accounts added successfully",
          });
        });
      }

      const { bankName, branch, accountNumber, beneficiaryName, isPrimary } =
        accounts[i];

      if (!bankName || !branch || !accountNumber || !beneficiaryName) {
        return db.rollback(() =>
          res.status(400).json({
            success: false,
            message: "All account fields are required",
          }),
        );
      }

      // If this account is primary, reset any existing primary
      const query = isPrimary
        ? `UPDATE bankDetails SET isPrimary = false WHERE tutorId = ?`
        : null;

      const insertAccount = () => {
        db.query(
          `INSERT INTO bankDetails (tutorId, bankName, branch, accountNumber, beneficiaryName, isPrimary)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            tutorId,
            bankName,
            branch,
            accountNumber,
            beneficiaryName,
            !!isPrimary,
          ],
          (err) => {
            if (err)
              return db.rollback(() =>
                res.status(500).json({ success: false, message: err.message }),
              );
            insertNext(i + 1);
          },
        );
      };

      if (query) {
        db.query(query, [tutorId], (err) => {
          if (err)
            return db.rollback(() =>
              res.status(500).json({ success: false, message: err.message }),
            );
          insertAccount();
        });
      } else {
        insertAccount();
      }
    };

    insertNext(0);
  });
});

// ============================
// 5️⃣ Get tutor name and profile pic by tutor ID
// ============================
tutorRouter.get("/:tutorId", (req, resp) => {
  const { tutorId } = req.params;
  if (!tutorId) {
    return resp
      .status(400)
      .json({ success: false, message: "Tutor ID is required" });
  }

  const sql = `
    SELECT fullName, profilePhoto
    FROM users
    WHERE userId = ?
  `;

  db.query(sql, [tutorId], (err, rows) => {
    if (err)
      return resp.status(500).json({ success: false, message: err.message });
    if (rows.length === 0) {
      return resp
        .status(404)
        .json({ success: false, message: "Tutor not found" });
    }
    resp.json({ success: true, data: rows[0] });
  });
});

tutorRouter.get("/available-days/:tutorId", (req, res) => {
  const { tutorId } = req.params;

  if (!tutorId) {
    return res
      .status(400)
      .json({ success: false, message: "Tutor ID is required" });
  }

  const sql = `
    SELECT DISTINCT dayOfWeek
    FROM tutorAvailability
    WHERE tutorId = ?
    ORDER BY FIELD(dayOfWeek,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
  `;

  db.query(sql, [tutorId], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }

    const availableDays = rows.map((row) => row.dayOfWeek);
    res.json({ success: true, availableDays });
  });
});

// ============================
// 📊 Tutor Dashboard Stats
// ============================
tutorRouter.get("/dashboard/:tutorId", (req, res) => {
  const { tutorId } = req.params;

  if (!tutorId)
    return res
      .status(400)
      .json({ success: false, message: "Tutor ID required" });

  // 1. Overall & Subject-wise Performance
  const subjectQuery = `
    SELECT 
      sub.subjectName,
      COUNT(DISTINCT s.sessionId) AS totalSessions,
      IFNULL(AVG(f.rating), 0) AS avgRating,
      IFNULL(SUM(p.amount), 0) AS totalRevenue
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN subject sub ON ts.subjectId = sub.subjectId
    LEFT JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'student'
    LEFT JOIN payment p ON s.sessionId = p.sessionId AND p.paymentStatus = 'Paid'
    WHERE ts.tutorId = ? AND s.sessionStatus = 'Completed'
    GROUP BY sub.subjectName
    ORDER BY avgRating DESC
  `;

  // 2. Booking Trends (Last 7 Days)
  const trendsQuery = `
    SELECT 
      DATE_FORMAT(s.date, '%Y-%m-%d') as dateStr,
      COUNT(s.sessionId) AS sessionCount
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    WHERE ts.tutorId = ? 
      AND s.sessionStatus IN ('Completed', 'Paid', 'Accepted') 
      AND s.date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
    GROUP BY dateStr
    ORDER BY dateStr ASC
  `;

  // 3. Peak Time Slots
  const peakTimeQuery = `
    SELECT 
      s.startTime,
      COUNT(s.sessionId) AS sessionCount
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    WHERE ts.tutorId = ?
    GROUP BY s.startTime
    ORDER BY sessionCount DESC
    LIMIT 5
  `;

  // 4. Detailed Feedback Analytics
  const feedbackQuery = `
    SELECT 
      sub.subjectName,
      s.sessionId,
      s.date,
      s.startTime,
      f.rating,
      f.comments
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN subject sub ON ts.subjectId = sub.subjectId
    JOIN feedback f ON s.sessionId = f.sessionId AND f.givenBy = 'student'
    WHERE ts.tutorId = ? AND s.sessionStatus = 'Completed'
    ORDER BY s.date DESC, s.startTime DESC
  `;

  db.query(subjectQuery, [tutorId], (err, subjectRows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    db.query(trendsQuery, [tutorId], (err2, trendRows) => {
      if (err2)
        return res.status(500).json({ success: false, message: err2.message });

      db.query(peakTimeQuery, [tutorId], (err3, peakRows) => {
        if (err3)
          return res
            .status(500)
            .json({ success: false, message: err3.message });

        db.query(feedbackQuery, [tutorId], (err4, feedbackRows) => {
          if (err4)
            return res
              .status(500)
              .json({ success: false, message: err4.message });

          // Calculate Overall Stats
          const totalCompletedSessions = subjectRows.reduce(
            (acc, curr) => acc + curr.totalSessions,
            0,
          );

          // Weighted Average Rating
          const weightedRatingNum = subjectRows.reduce(
            (acc, curr) => acc + curr.avgRating * curr.totalSessions,
            0,
          );
          const overallAvgRating =
            totalCompletedSessions > 0
              ? (weightedRatingNum / totalCompletedSessions).toFixed(1)
              : 0;

          // Group feedback by subject
          const feedbackBySubject = {};
          feedbackRows.forEach((row) => {
            if (!feedbackBySubject[row.subjectName]) {
              feedbackBySubject[row.subjectName] = [];
            }
            feedbackBySubject[row.subjectName].push({
              sessionId: row.sessionId,
              date: row.date,
              startTime: row.startTime,
              rating: row.rating,
              comment: row.comments,
            });
          });

          // Mock Trends Data with random values for Pie Chart (Tutor)
          const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const processedTrends = days.map((day) => ({
            day: day,
            sessionCount: Math.floor(Math.random() * 20) + 5, // Random value between 5-25
          }));

          res.json({
            success: true,
            data: {
              overall: {
                totalSessions: totalCompletedSessions,
                avgRating: overallAvgRating,
              },
              subjects: subjectRows,
              trends: processedTrends,
              peakTimes: peakRows,
              feedbackAnalytics: feedbackBySubject,
            },
          });
        });
      });
    });
  });
});

export default tutorRouter;
