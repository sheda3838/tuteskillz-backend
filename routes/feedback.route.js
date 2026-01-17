import { Router } from "express";
import db from "../config/db.js";

const feedbackRouter = Router();

// Get feedback for a session
feedbackRouter.get("/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;

  if (!sessionId) {
    return res
      .status(400)
      .json({ success: false, message: "Missing session ID" });
  }

  const query = "SELECT * FROM feedback WHERE sessionId = ?";
  db.query(query, [sessionId], (err, rows) => {
    if (err) {
      console.error("Error fetching feedback:", err);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch feedback" });
    }

    // Organize by role
    const studentFeedback =
      rows.find((row) => row.givenBy === "student") || null;
    const tutorFeedback = rows.find((row) => row.givenBy === "tutor") || null;

    res.json({
      success: true,
      data: {
        studentFeedback,
        tutorFeedback,
      },
    });
  });
});

// Submit Feedback
feedbackRouter.post("/", (req, res) => {
  const { sessionId, rating, comments, givenBy } = req.body;

  if (!sessionId || !rating || !comments || !givenBy) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  if (rating < 1 || rating > 5) {
    return res
      .status(400)
      .json({ success: false, message: "Rating must be between 1 and 5" });
  }

  const query =
    "INSERT INTO feedback (sessionId, rating, comments, givenBy) VALUES (?, ?, ?, ?)";
  db.query(query, [sessionId, rating, comments, givenBy], (err, result) => {
    if (err) {
      console.error("Error saving feedback:", err);
      return res
        .status(500)
        .json({ success: false, message: "Failed to save feedback" });
    }

    res.json({
      success: true,
      message: "Feedback submitted successfully",
      feedbackId: result.insertId,
      createdAt: new Date(), // Approximate, for immediate UI update
    });
  });
});

// Edit Feedback
feedbackRouter.put("/:feedbackId", (req, res) => {
  const feedbackId = req.params.feedbackId;
  const { rating, comments } = req.body;

  if (!rating || !comments) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required" });
  }

  // Check existence and time window
  const checkQuery = "SELECT createdAt FROM feedback WHERE feedbackId = ?";
  db.query(checkQuery, [feedbackId], (err, rows) => {
    if (err)
      return res
        .status(500)
        .json({ success: false, message: "Database error" });
    if (rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Feedback not found" });

    const createdAt = new Date(rows[0].createdAt);
    const now = new Date();
    const diffMins = (now - createdAt) / 1000 / 60;

    if (diffMins > 30) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Edit window has expired (30 mins limit)",
        });
    }

    const updateQuery =
      "UPDATE feedback SET rating = ?, comments = ? WHERE feedbackId = ?";
    db.query(updateQuery, [rating, comments, feedbackId], (err2) => {
      if (err2)
        return res
          .status(500)
          .json({ success: false, message: "Failed to update feedback" });

      res.json({ success: true, message: "Feedback updated successfully" });
    });
  });
});

export default feedbackRouter;
