import db from "./config/db.js";

async function test() {
  const [rows] = await db
    .promise()
    .query(
      "SELECT profilePhoto FROM users WHERE profilePhoto IS NOT NULL LIMIT 1",
    );
  if (rows.length > 0) {
    console.log("PHOTO TYPE:", typeof rows[0].profilePhoto);
    console.log("IS BUFFER:", Buffer.isBuffer(rows[0].profilePhoto));
  } else {
    console.log("NO PHOTOS FOUND");
  }
  process.exit();
}
test();
