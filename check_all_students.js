import db from "./config/db.js";

async function test() {
  try {
    const [counts] = await db.promise().query(`
            SELECT studentId, COUNT(*) as c 
            FROM session 
            WHERE sessionStatus IN ('Completed', 'Paid', 'Accepted')
            GROUP BY studentId
        `);
    console.log("SESSION COUNTS PER STUDENT:", JSON.stringify(counts));
  } catch (err) {
    console.error(err);
  }
  process.exit();
}
test();
