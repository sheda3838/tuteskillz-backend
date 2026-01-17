// subject.route.js
import { Router } from "express";
import db from "../config/db.js";

const subjectRouter = Router();

subjectRouter.get("/", (req, res) => {
  db.query(
    "SELECT subjectId, subjectName FROM subject ORDER BY subjectName ASC",
    (err, rows) => {
      if (err) {
        console.error("Error fetching subjects:", err.message);
        return res.status(500).json({ message: "Server error fetching subjects" });
      }
      res.json(rows);
    }
  );
});

export default subjectRouter;
