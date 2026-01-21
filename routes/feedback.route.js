import { Router } from "express";
import db from "../config/db.js";

const feedbackRouter = Router();

function isDebug() {
  return process.env.DEBUG === "true" || process.env.NODE_ENV !== "production";
}

function sendDbError(res, context, err) {
  console.error(`[${context}]`, {
    message: err.message,
    code: err.code,
    errno: err.errno,
    sqlMessage: err.sqlMessage,
    sqlState: err.sqlState,
    sql: err.sql,
  });

  const payload = {
    success: false,
    message: "Database error",
  };

  if (isDebug()) {
    payload.debug = {
      context,
      code: err.code,
      errno: err.errno,
      sqlMessage: err.sqlMessage,
      sqlState: err.sqlState,
    };
  }

  return res.status(500).json(payload);
}

// Get feedback for a session
feedbackRouter.get("/:sessionId", (req, res) => {
  const sessionId = Number(req.params.sessionId);

  if (!sessionId) {
    return res.status(400).json({ success: false, message: "Missing session ID" });
  }

  const query = "SELECT * FROM feedback WHERE sessionId = ?";
  db.query(query, [sessionId], (err, rows) => {
    if (err) return sendDbError(res, "GET /feedback/:sessionId", err);

    const studentFeedback = rows.find((row) => row.givenBy === "student") || null;
    const tutorFeedback = rows.find((row) => row.givenBy === "tutor") || null;

    res.json({ success: true, data: { studentFeedback, tutorFeedback } });
  });
});

// Submit Feedback
feedbackRouter.post("/", (req, res) => {
  const sessionId = Number(req.body.sessionId);
  const rating = Number(req.body.rating);
  const comments = String(req.body.comments || "").trim();
  const givenBy = String(req.body.givenBy || "").trim();

  if (!sessionId || !rating || !comments || !givenBy) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
  }

  const query =
    "INSERT INTO feedback (sessionId, rating, comments, givenBy) VALUES (?, ?, ?, ?)";

  db.query(query, [sessionId, rating, comments, givenBy], (err, result) => {
    if (err) return sendDbError(res, "POST /feedback", err);

    // If your table has createdAt default CURRENT_TIMESTAMP,
    // better to fetch it from DB (optional)
    res.status(201).json({
      success: true,
      message: "Feedback submitted successfully",
      feedbackId: result.insertId,
    });
  });
});

// Edit Feedback
feedbackRouter.put("/:feedbackId", (req, res) => {
  const feedbackId = Number(req.params.feedbackId);
  const rating = Number(req.body.rating);
  const comments = String(req.body.comments || "").trim();

  if (!feedbackId) {
    return res.status(400).json({ success: false, message: "Missing feedback ID" });
  }

  if (!rating || !comments) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  const checkQuery = "SELECT createdAt FROM feedback WHERE feedbackId = ?";
  db.query(checkQuery, [feedbackId], (err, rows) => {
    if (err) return sendDbError(res, "PUT /feedback/:feedbackId (check)", err);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Feedback not found" });
    }

    const createdAt = new Date(rows[0].createdAt);
    const diffMins = (Date.now() - createdAt.getTime()) / 1000 / 60;

    if (diffMins > 30) {
      return res.status(403).json({
        success: false,
        message: "Edit window has expired (30 mins limit)",
      });
    }

    const updateQuery =
      "UPDATE feedback SET rating = ?, comments = ? WHERE feedbackId = ?";

    db.query(updateQuery, [rating, comments, feedbackId], (err2) => {
      if (err2) return sendDbError(res, "PUT /feedback/:feedbackId (update)", err2);

      res.json({ success: true, message: "Feedback updated successfully" });
    });
  });
});

export default feedbackRouter;
