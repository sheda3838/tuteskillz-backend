import mysql from "mysql2";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    ca: fs.readFileSync(process.env.CA),
  },
});

db.connect((err) => {
  if (err) return console.log("DB Connection failed: ", err.message);
  return console.log("DB Connected Successfully...");
});

export default db;
