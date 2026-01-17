import express from "express";
import db from "../config/db.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure directories exist
const TMP_DIR = path.join(__dirname, "../uploads/tmp");
const SAFE_DIR = path.join(__dirname, "../uploads/safe");

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
if (!fs.existsSync(SAFE_DIR)) fs.mkdirSync(SAFE_DIR, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

/**
 * Upload notes (PDF) with Fake Virus Scanning
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  const { sessionId, title } = req.body;
  const file = req.file;

  if (!sessionId || !title || !file) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required fields" });
  }

  const tmpPath = file.path;
  const safePath = path.join(SAFE_DIR, file.filename);

  try {
    // Move to safe directory
    fs.renameSync(tmpPath, safePath);

    // Read file buffer for DB (Legacy compatibility)
    const fileBuffer = fs.readFileSync(safePath);

    // Insert into DB
    const query =
      "INSERT INTO notes (sessionId, title, document) VALUES (?, ?, ?)";
    db.query(query, [sessionId, title, fileBuffer], (err, result) => {
      if (err) {
        console.error("Error uploading notes:", err);
        return res
          .status(500)
          .json({ success: false, message: "Failed to save notes to DB" });
      }

      return res.status(200).json({
        success: true,
        message: "File uploaded successfully",
        noteId: result.insertId,
      });
    });
  } catch (err) {
    console.error("Upload processing error:", err);
    // Cleanup tmp if exists
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch (e) {}
    }
    return res
      .status(500)
      .json({ success: false, message: "Server error during file processing" });
  }
});

/**
 * Get notes for a session
 */
router.get("/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;

  if (!sessionId) {
    return res
      .status(400)
      .json({ success: false, message: "Missing session ID" });
  }

  const query = "SELECT noteId, title FROM notes WHERE sessionId = ?";
  db.query(query, [sessionId], (err, results) => {
    if (err) {
      console.error("Error fetching notes:", err);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch notes" });
    }

    return res.status(200).json({ success: true, notes: results });
  });
});

/**
 * Get notes for a session
 */
router.get("/:sessionId/:noteId", (req, res) => {
  const { sessionId, noteId } = req.params;

  if (!sessionId || !noteId) {
    return res
      .status(400)
      .json({ success: false, message: "Missing session ID or note ID" });
  }

  const query =
    "SELECT title, document FROM notes WHERE sessionId = ? AND noteId = ?";
  db.query(query, [sessionId, noteId], (err, results) => {
    if (err) {
      console.error("Error fetching note:", err);
      return res
        .status(500)
        .json({ success: false, message: "Failed to fetch note" });
    }

    if (!results.length)
      return res
        .status(404)
        .json({ success: false, message: "Note not found" });

    const note = results[0];
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${note.title}.pdf"`
    );
    res.send(note.document); // send raw buffer
  });
});

/**
 * Delete a note
 */
router.delete("/:noteId", (req, res) => {
  const noteId = req.params.noteId;

  if (!noteId) {
    return res.status(400).json({ success: false, message: "Missing note ID" });
  }

  const query = "DELETE FROM notes WHERE noteId = ?";
  db.query(query, [noteId], (err, result) => {
    if (err) {
      console.error("Error deleting note:", err);
      return res
        .status(500)
        .json({ success: false, message: "Failed to delete note" });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Note not found" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Note deleted successfully" });
  });
});

export default router;
