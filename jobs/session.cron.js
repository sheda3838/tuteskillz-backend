import cron from "node-cron";
import db from "../config/db.js";

const setupSessionCron = () => {
  // Run immediately on server start
  // console.log("Running initial session completion check...");
  checkAndCompleteSessions();

  // Schedule to run every minute
  cron.schedule("* * * * *", () => {
    // console.log("Running session completion cron job...");
    checkAndCompleteSessions();
  });
};

const checkAndCompleteSessions = () => {
  const query = `
    SELECT sessionId, date, startTime, duration 
    FROM session 
    WHERE sessionStatus = 'Paid'
  `;

  db.query(query, (err, sessions) => {
    if (err) {
      console.error("Cron Error fetching sessions:", err);
      return;
    }

    if (!sessions.length) return;

    const now = new Date();

    sessions.forEach((session) => {
      try {
        // Construct the session start Date object
        const sessionDate = new Date(session.date);
        const [hours, minutes] = session.startTime.split(":").map(Number);

        // Set the start time on the date object
        sessionDate.setHours(hours, minutes, 0, 0);

        // Add duration (assuming stored in hours as per project analysis)
        // duration is typically 2 (hours)
        const durationHours = session.duration || 0;
        sessionDate.setHours(sessionDate.getHours() + durationHours);

        const endTime = sessionDate;

        // Compare with current server time
        if (now > endTime) {
          markSessionAsCompleted(session.sessionId);
        }
      } catch (parseError) {
        console.error(
          `Error parsing session ${session.sessionId}:`,
          parseError
        );
      }
    });
  });
};

const markSessionAsCompleted = (sessionId) => {
  const updateQuery =
    "UPDATE session SET sessionStatus = 'Completed' WHERE sessionId = ?";

  db.query(updateQuery, [sessionId], (err, result) => {
    if (err) {
      console.error(`Failed to mark session ${sessionId} as Completed:`, err);
    } else {
      console.log(`Session ${sessionId} marked as Completed`);
    }
  });
};

export default setupSessionCron;
