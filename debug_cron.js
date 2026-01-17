import db from "./config/db.js";

const debugSessionCompletion = () => {
  console.log("DEBUG: Starting session completion check...");

  const query = `
    SELECT sessionId, date, startTime, duration 
    FROM session 
    WHERE sessionStatus = 'Paid'
  `;

  db.query(query, (err, sessions) => {
    if (err) {
      console.error("DEBUG Error fetching sessions:", err);
      process.exit(1);
    }

    console.log(`DEBUG: Found ${sessions.length} 'Paid' sessions.`);

    if (!sessions.length) {
      process.exit(0);
    }

    const now = new Date();
    console.log(`DEBUG: Current Server Time: ${now.toString()}`);

    sessions.forEach((session) => {
      try {
        console.log(`\n---------------------------------`);
        console.log(`Checking Session ID: ${session.sessionId}`);
        console.log(
          `Raw DB Date: ${session.date} (Type: ${typeof session.date})`
        );
        console.log(
          `Raw DB StartTime: ${
            session.startTime
          } (Type: ${typeof session.startTime})`
        );
        console.log(`Duration: ${session.duration} hours`);

        // Logic from cron
        const sessionDate = new Date(session.date);
        const [hours, minutes] = session.startTime.split(":").map(Number);

        console.log(`Parsed StartTime: ${hours}:${minutes}`);
        console.log(`Initial Session Date Object: ${sessionDate.toString()}`);

        // Set the start time
        sessionDate.setHours(hours, minutes, 0, 0);
        console.log(`Date after setHours: ${sessionDate.toString()}`);

        // Add duration
        const durationHours = session.duration || 0;
        sessionDate.setHours(sessionDate.getHours() + durationHours);

        const endTime = sessionDate;
        console.log(`Calculated EndTime: ${endTime.toString()}`);
        console.log(`Current Time (now): ${now.toString()}`);

        // Compare
        if (now > endTime) {
          console.log(`RESULT: Session SHOULD be marked Completed.`);
        } else {
          console.log(`RESULT: Session is NOT yet completed.`);
        }
      } catch (parseError) {
        console.error(
          `Error parsing session ${session.sessionId}:`,
          parseError
        );
      }
    });

    // Close DB connection after a short delay to ensure logs flush
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  });
};

debugSessionCompletion();
