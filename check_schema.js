import db from "./config/db.js";

const checkTable = () => {
  db.query("DESCRIBE feedback", (err, result) => {
    if (err) {
      console.error("Error describing feedback table:", err);
    } else {
      console.log("Feedback Table Schema:", result);
    }
    process.exit();
  });
};

checkTable();
