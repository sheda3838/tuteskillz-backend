import db from "./config/db.js";

async function updateSchema() {
  try {
    console.log("Updating payment table schema...");

    // 1. Make slip nullable
    try {
      await db
        .promise()
        .query("ALTER TABLE payment MODIFY COLUMN slip longblob NULL");
      console.log("✅ Made 'slip' nullable.");
    } catch (e) {
      console.log(
        "⚠️  Could not modify 'slip' (might already be null or incompatible):",
        e.message,
      );
    }

    // 2. Add currency column
    try {
      await db
        .promise()
        .query(
          "ALTER TABLE payment ADD COLUMN currency VARCHAR(10) DEFAULT 'LKR'",
        );
      console.log("✅ Added 'currency' column.");
    } catch (e) {
      if (e.message.includes("Duplicate column")) {
        console.log("ℹ️  'currency' column already exists.");
      } else {
        console.error("❌ Failed to add 'currency':", e.message);
      }
    }

    // 3. Add provider column
    try {
      await db
        .promise()
        .query(
          "ALTER TABLE payment ADD COLUMN provider VARCHAR(50) DEFAULT 'Stripe'",
        );
      console.log("✅ Added 'provider' column.");
    } catch (e) {
      if (e.message.includes("Duplicate column")) {
        console.log("ℹ️  'provider' column already exists.");
      } else {
        console.error("❌ Failed to add 'provider':", e.message);
      }
    }

    // 4. Add transactionId column
    try {
      await db
        .promise()
        .query(
          "ALTER TABLE payment ADD COLUMN transactionId VARCHAR(255) DEFAULT NULL",
        );
      console.log("✅ Added 'transactionId' column.");
    } catch (e) {
      if (e.message.includes("Duplicate column")) {
        console.log("ℹ️  'transactionId' column already exists.");
      } else {
        console.error("❌ Failed to add 'transactionId':", e.message);
      }
    }

    console.log("Schema update completed.");
  } catch (err) {
    console.error("Fatal error:", err);
  }
  process.exit();
}
updateSchema();
