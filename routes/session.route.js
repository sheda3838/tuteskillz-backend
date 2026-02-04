import { Router } from "express";
import db from "../config/db.js";
import { sendEmail } from "../utils/email.js";
import { generateEmailHTML } from "../utils/emailTemplate.js";

const sessionRouter = Router();

sessionRouter.post("/request", (req, res) => {
  const { tutorSubjectId, studentId, date, startTime, duration, studentNote } =
    req.body;

  if (!tutorSubjectId || !studentId || !date || !startTime || !duration) {
    return res.status(400).json({
      success: false,
      message: "All required fields must be provided",
    });
  }

  const sql = `
    INSERT INTO session 
      (tutorSubjectId, studentId, date, startTime, duration, studentNote, sessionStatus)
    VALUES (?, ?, ?, ?, ?, ?, 'Requested')
  `;

  db.query(
    sql,
    [tutorSubjectId, studentId, date, startTime, duration, studentNote],
    (err, result) => {
      if (err)
        return res.status(500).json({ success: false, message: err.message });

      res.json({
        success: true,
        message: "Session requested successfully",
        sessionId: result.insertId,
      });
    },
  );
});

sessionRouter.get("/tutor-info/:tutorSubjectId", (req, res) => {
  const { tutorSubjectId } = req.params;

  const sql = `
    SELECT 
      ts.tutorSubjectId,
      ts.grade,
      ts.teachingMedium,
      s.subjectId,
      s.subjectName,
      u.userId AS tutorId,
      u.fullName AS tutorName
    FROM tutorSubject ts
    JOIN subject s ON ts.subjectId = s.subjectId
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN users u ON t.userId = u.userId
    WHERE ts.tutorSubjectId = ?
  `;

  db.query(sql, [tutorSubjectId], (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    if (rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Tutor not found" });

    res.json({ success: true, data: rows[0] });
  });
});

// Fetching tutor sessions
sessionRouter.get("/tutor/:tutorId/sessions", (req, res) => {
  const tutorId = parseInt(req.params.tutorId, 10);
  const { status } = req.query;

  if (isNaN(tutorId)) {
    return res.status(400).json({ success: false, message: "Invalid tutorId" });
  }

  // Auth & ownership check (assumes req.user is set by your auth middleware)
  // Tutors may only request their own sessions; admins allowed
  if (req.user?.role === "tutor" && req.user.userId !== tutorId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  // Build SQL — select only the fields we need now (include meetingUrl, studentNote, tutorNote)
  let sql = `
    SELECT
      s.sessionId,
      s.date,
      s.startTime,
      s.duration,
      s.sessionStatus,
      s.zoomUrl,
      s.recordingUrl,
      s.studentNote,
      s.tutorNote,



      -- Tutor info (just ID & name maybe)
t.userId AS tutorId,
tu.fullName AS tutorName,

-- Student info including profile photo
stu.userId AS studentId,
su.fullName AS studentName,
su.profilePhoto AS studentProfilePhoto,


      -- subject & tutorSubject info
      sub.subjectName,
      ts.grade,
      ts.teachingMedium

    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN subject sub ON ts.subjectId = sub.subjectId
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN users tu ON t.userId = tu.userId
    JOIN student stu ON s.studentId = stu.userId
    JOIN users su ON stu.userId = su.userId

    WHERE ts.tutorId = ?
  `;

  const params = [tutorId];

  // Optional status filter
  if (status) {
    sql += " AND s.sessionStatus = ?";
    params.push(status);
  }

  // Optional: order by upcoming first
  sql += " ORDER BY s.date ASC, s.startTime ASC";

  db.query(sql, params, (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    // Return results (empty array is fine)
    return res.json({ success: true, data: rows });
  });
});

// Accept, Reject, or Cancel a session
sessionRouter.put("/:sessionId/status", (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  const { status, reason, tutorNote } = req.body; // 'reason' for cancellation

  if (isNaN(sessionId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid sessionId" });
  }

  if (!status || !["Accepted", "Declined", "Cancelled"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }

  // 1. Fetch current session details first
  const fetchSql = `
    SELECT s.*, ts.tutorId, s.studentId, 
           stu_u.email as studentEmail, stu_u.fullName as studentName,
           tut_u.email as tutorEmail, tut_u.fullName as tutorName
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN student stu ON s.studentId = stu.userId
    JOIN users stu_u ON stu.userId = stu_u.userId
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN users tut_u ON t.userId = tut_u.userId
    WHERE s.sessionId = ?
  `;

  db.query(fetchSql, [sessionId], (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    if (rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    const session = rows[0];
    const { studentId, studentEmail, studentName, tutorEmail, tutorName } =
      session;

    // --- CANCELLATION LOGIC ---
    if (status === "Cancelled") {
      let updateSql =
        "UPDATE session SET sessionStatus = 'Cancelled' WHERE sessionId = ?";
      let updateParams = [sessionId];
      let creditGiven = false;

      // If Paid, give credit
      if (session.sessionStatus === "Paid") {
        const updateSessionSql =
          "UPDATE session SET sessionStatus = 'Cancelled' WHERE sessionId = ?";
        const updateStudentSql =
          "UPDATE student SET freeSessionCredit = 1 WHERE userId = ?";

        db.query(updateSessionSql, [sessionId], (err2) => {
          if (err2)
            return res
              .status(500)
              .json({ success: false, message: err2.message });

          db.query(updateStudentSql, [studentId], async (err3) => {
            if (err3) console.error("Failed to update student credit", err3); // Log but don't fail the whole request if possible, or handle better

            // Send Emails
            const emailSubject = "Session Cancelled - TuteSkillz";
            const emailBody = `
                <p>The session scheduled for ${session.date} at ${
                  session.startTime
                } has been cancelled.</p>
                <p><strong>Reason:</strong> ${
                  reason || "No reason provided."
                }</p>
                <p><strong>Note:</strong> A free session credit has been applied to the student's account.</p>
              `;

            try {
              await sendEmail(studentEmail, emailSubject, emailBody);
              await sendEmail(tutorEmail, emailSubject, emailBody);
            } catch (e) {
              console.error("Email sending failed", e);
            }

            return res.json({
              success: true,
              message: "Session cancelled successfully",
            });
          });
        });
        return; // Return early to avoid running the else block
      }

      // Standard Cancellation (Not Paid)
      db.query(updateSql, updateParams, async (err2) => {
        if (err2)
          return res
            .status(500)
            .json({ success: false, message: err2.message });

        // Send Emails
        const emailSubject = "Session Cancelled - TuteSkillz";
        const emailBody = `
          <p>The session scheduled for ${session.date} at ${
            session.startTime
          } has been cancelled.</p>
          <p><strong>Reason:</strong> ${reason || "No reason provided."}</p>
        `;

        try {
          await sendEmail(studentEmail, emailSubject, emailBody);
          await sendEmail(tutorEmail, emailSubject, emailBody);
        } catch (e) {
          console.error("Email sending failed", e);
        }

        return res.json({
          success: true,
          message: "Session cancelled successfully",
        });
      });
    }

    // --- ACCEPTANCE LOGIC (Check for Credit) ---
    else if (status === "Accepted") {
      // Check if student has credit
      db.query(
        "SELECT freeSessionCredit FROM student WHERE userId = ?",
        [studentId],
        (err3, stuRows) => {
          if (err3)
            return res
              .status(500)
              .json({ success: false, message: err3.message });

          const hasCredit = stuRows[0]?.freeSessionCredit;

          if (hasCredit) {
            // Redeem Credit: Mark as Paid immediately
            const zoomUrl = `https://meet.jit.si/session_${sessionId}_${Date.now()}`;
            const txnId = `CREDIT-${Date.now()}`;

            // 1. Update Session
            const updateSessionSql =
              "UPDATE session SET sessionStatus = 'Paid', zoomUrl = ? WHERE sessionId = ?";
            db.query(updateSessionSql, [zoomUrl, sessionId], (err4) => {
              if (err4)
                return res
                  .status(500)
                  .json({ success: false, message: err4.message });

              // 2. Update Student Credit
              const updateStudentSql =
                "UPDATE student SET freeSessionCredit = 0 WHERE userId = ?";
              db.query(updateStudentSql, [studentId], (err5) => {
                if (err5) console.error("Failed to reset student credit", err5);

                // 3. Insert Payment
                const insertPaymentSql = `
                    INSERT INTO payment (sessionId, amount, currency, paymentStatus, paymentMethod, provider, transactionId) 
                    VALUES (?, 0, 'LKR', 'Paid', 'Credit', 'System', ?)
                  `;
                db.query(insertPaymentSql, [sessionId, txnId], async (err6) => {
                  if (err6)
                    console.error(
                      "Failed to insert credit payment record",
                      err6,
                    );

                  // Notify Student
                  await sendEmail(
                    studentEmail,
                    "Session Accepted & Credit Applied",
                    `<p>Your session has been accepted. Your free session credit was applied automatically.</p>
                        <p>Meeting Link: <a href="${zoomUrl}">${zoomUrl}</a></p>`,
                  );

                  return res.json({
                    success: true,
                    message: "Session accepted and credit applied.",
                  });
                });
              });
            });
          } else {
            // Standard Accept
            const updateSql =
              "UPDATE session SET sessionStatus = 'Accepted', tutorNote = ? WHERE sessionId = ?";
            db.query(
              updateSql,
              [tutorNote || null, sessionId],
              async (err5) => {
                if (err5)
                  return res
                    .status(500)
                    .json({ success: false, message: err5.message });

                try {
                  await sendEmail(
                    studentEmail,
                    "Session Request Accepted",
                    `<p>Your session request has been accepted. Please proceed to payment.</p>`,
                  );
                } catch (e) {
                  console.error("Email sending failed", e);
                }

                return res.json({
                  success: true,
                  message: "Session accepted successfully",
                });
              },
            );
          }
        },
      );
    }

    // --- DECLINE LOGIC ---
    else {
      const updateSql =
        "UPDATE session SET sessionStatus = ? WHERE sessionId = ?";
      db.query(updateSql, [status, sessionId], (err6) => {
        if (err6)
          return res
            .status(500)
            .json({ success: false, message: err6.message });
        return res.json({
          success: true,
          message: `Session ${status.toLowerCase()} successfully`,
        });
      });
    }
  });
});

// fetching student sessions
sessionRouter.get("/student/:studentId/sessions", (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  const { status } = req.query;

  if (isNaN(studentId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid studentId" });
  }

  // Optional: auth check, make sure req.user.userId === studentId or admin
  if (req.user?.role === "student" && req.user.userId !== studentId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  let sql = `
    SELECT
      s.sessionId,
      s.date,
      s.startTime,
      s.duration,
      s.sessionStatus,
      s.zoomUrl,
      s.recordingUrl,
      s.studentNote,
      s.tutorNote,

      -- Tutor info
      t.userId AS tutorId,
      tu.fullName AS tutorName,
      tu.profilePhoto AS tutorProfilePhoto,

      -- Subject & grade info
      sub.subjectName,
      ts.grade,
      ts.teachingMedium

    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    JOIN subject sub ON ts.subjectId = sub.subjectId
    JOIN tutor t ON ts.tutorId = t.userId
    JOIN users tu ON t.userId = tu.userId
    WHERE s.studentId = ?
  `;

  const params = [studentId];

  if (status) {
    sql += " AND s.sessionStatus = ?";
    params.push(status);
  }

  sql += " ORDER BY s.date ASC, s.startTime ASC";

  db.query(sql, params, (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: rows });
  });
});

// GET /session/:id
sessionRouter.get("/:id", (req, res) => {
  const sessionId = req.params.id;

  const sql = `
    SELECT 
  s.sessionId,
  s.date,
  s.startTime,
  s.duration,
  s.sessionStatus,
  s.zoomUrl,
  s.recordingUrl,
  s.studentNote,
  s.tutorNote,
  s.studentId,
  
  ts.tutorId,
  sub.subjectName,
  ts.grade,
  ts.teachingMedium

FROM session s
JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
JOIN subject sub ON ts.subjectId = sub.subjectId
WHERE s.sessionId = ?;

  `;

  db.query(sql, [sessionId], (err, sessions) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });
    if (sessions.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });

    res.json({ success: true, data: sessions[0] });
  });
});

// ===========================
// Check student session conflict (fixed 2-hour duration)
// ===========================
sessionRouter.get("/student/:studentId/check-conflict", (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  const { date, startTime } = req.query;

  if (!studentId || !date || !startTime) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields (studentId, date, startTime)",
    });
  }

  // Fixed duration = 120 mins
  const duration = 120;

  // Convert new session time → minutes
  const [sh, sm] = startTime.split(":").map(Number);
  const newStart = sh * 60 + sm;
  const newEnd = newStart + duration;

  const sql = `
    SELECT sessionId, date, startTime, duration, sessionStatus
    FROM session
    WHERE studentId = ?
      AND date = ?
      AND sessionStatus IN ('Requested', 'Accepted', 'Submitted')
  `;

  db.query(sql, [studentId, date], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }

    if (rows.length === 0) {
      return res.json({ success: true, conflict: false });
    }

    for (const session of rows) {
      const [eh, em] = session.startTime.split(":").map(Number);
      const existingStart = eh * 60 + em;
      const existingEnd = existingStart + session.duration;

      // Check overlap
      const isOverlap = newStart < existingEnd && newEnd > existingStart;

      if (isOverlap) {
        return res.json({
          success: true,
          conflict: true,
          message: "You already have a session at this time on the same date.",
          conflictingSession: session,
        });
      }
    }

    return res.json({ success: true, conflict: false });
  });
});

// ===========================
// Check tutor session conflict
// ===========================
sessionRouter.get("/tutor/:tutorId/check-conflict", (req, res) => {
  const tutorId = parseInt(req.params.tutorId, 10);
  const { date, startTime } = req.query;

  if (!tutorId || !date || !startTime) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields (tutorId, date, startTime)",
    });
  }

  const duration = 120; // fixed 2 hours

  const [sh, sm] = startTime.split(":").map(Number);
  const newStart = sh * 60 + sm;
  const newEnd = newStart + duration;

  const sql = `
    SELECT sessionId, date, startTime, duration, sessionStatus
    FROM session s
    JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
    WHERE ts.tutorId = ? 
      AND s.date = ? 
      AND s.sessionStatus = 'Accepted'
  `;

  db.query(sql, [tutorId, date], (err, rows) => {
    if (err)
      return res.status(500).json({ success: false, message: err.message });

    if (rows.length === 0) return res.json({ success: true, conflict: false });

    for (const session of rows) {
      const [eh, em] = session.startTime.split(":").map(Number);
      const existingStart = eh * 60 + em;
      const existingEnd = existingStart + session.duration;

      const isOverlap = newStart < existingEnd && newEnd > existingStart;
      if (isOverlap) {
        return res.json({
          success: true,
          conflict: true,
          message: "You already have an accepted session at this time.",
          conflictingSession: session,
        });
      }
    }

    return res.json({ success: true, conflict: false });
  });
});

export default sessionRouter;
