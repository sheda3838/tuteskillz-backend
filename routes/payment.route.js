// backend/routes/payment.js
import { Router } from "express";
import db from "../config/db.js"; // your existing db connection
import dotenv from "dotenv";
import CryptoJS from "crypto-js";
import { sendEmail } from "../utils/email.js";
import { generateEmailHTML } from "../utils/emailTemplate.js";

dotenv.config();

const router = Router();

function generateJitsiLink(sessionId) {
  const timestamp = Date.now(); // ensures uniqueness
  const roomName = `session_${sessionId}_${timestamp}`;
  return `https://meet.jit.si/${roomName}`;
}

// PayHere webhook
router.post("/payhere/webhook", async (req, resp) => {
  console.log("🔔 PayHere Webhook Triggered");
  await processPayment(req.body, resp);
});

// Localhost Simulation Route (For Dev Only)
router.post("/payhere/simulate", async (req, res) => {
  console.log("🔔 PayHere Simulation Triggered (Localhost)");
  // Mock the PayHere payload structure
  const payload = {
    merchant_id: process.env.PAYHERE_MERCHANT_ID,
    order_id: req.body.order_id,
    status_code: "2", // Simulate success
    payhere_amount: req.body.amount || "1000.00",
    currency: "LKR",
    method: "TEST",
    transaction_id: "SIM-" + Date.now(),
  };
  await processPayment(payload, res);
});

// Reusable Payment Processor
async function processPayment(data, resp) {
  console.log("Payload:", JSON.stringify(data, null, 2));

  const {
    merchant_id,
    order_id,
    status_code,
    payhere_amount,
    currency,
    method,
    transaction_id,
  } = data;

  // Debug Merchant ID
  const envMerchantId = process.env.PAYHERE_MERCHANT_ID;
  console.log(
    `Merchant ID Check: Received '${merchant_id}' vs Env '${envMerchantId}'`
  );

  // Use correct App ID (loose comparison)
  if (merchant_id != envMerchantId) {
    console.error("❌ Invalid Merchant ID");
    return resp.status(400).send("Invalid Merchant ID");
  }

  // Determine payment status
  let paymentStatus = "Failed";
  if (status_code == 2) {
    paymentStatus = "Paid";
  }

  console.log(
    `Payment Status Determined: ${paymentStatus} (Status Code: ${status_code})`
  );

  // Check if payment already exists to avoid duplicates
  const checkSql = "SELECT paymentId FROM payment WHERE transactionId = ?";
  db.query(checkSql, [transaction_id], (err, rows) => {
    if (!err && rows.length > 0) {
      console.log("⚠️ Payment already processed. Skipping.");
      return resp.status(200).send("Already Processed");
    }

    // Insert into payment table
    const insertSql = `INSERT INTO payment (sessionId, amount, currency, paymentStatus, paymentMethod, provider, transactionId) VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.query(
      insertSql,
      [
        order_id,
        payhere_amount,
        currency,
        paymentStatus,
        method,
        "PayHere",
        transaction_id,
      ],
      (err, result) => {
        if (err) {
          console.error("❌ Payment insert error:", err);
          return resp.status(500).send("Server Error");
        }
        console.log("✅ Payment record inserted:", result.insertId);

        // Update session status if Paid
        if (paymentStatus === "Paid") {
          const meetingUrl = generateJitsiLink(order_id);
          console.log("Generated Meeting URL:", meetingUrl);

          const updateSql = `UPDATE session SET sessionStatus = 'Paid', meetingUrl = ? WHERE sessionId = ?`;
          db.query(updateSql, [meetingUrl, order_id], (err2, result2) => {
            if (err2) {
              console.error("❌ Session update error:", err2);
              return resp.status(500).send("Server Error");
            }

            console.log(
              "✅ Session updated. Affected rows:",
              result2.affectedRows
            );

            // Fetch tutor email to send notification
            const tutorQuery = `
              SELECT u.email, u.fullName
              FROM session s
              JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
              JOIN users u ON ts.tutorId = u.userId
              WHERE s.sessionId = ?
            `;

            db.query(tutorQuery, [order_id], async (err3, rows) => {
              if (rows && rows.length > 0) {
                const { email, fullName } = rows[0];
                const emailHtml = generateEmailHTML({
                  title: "Payment Received!",
                  message: `Hello ${fullName}, the payment for your session has been received.`,
                  buttonText: "Go to Session",
                  buttonUrl: `${
                    process.env.FRONTEND_URL || "http://localhost:5173"
                  }/session/${order_id}`,
                });

                try {
                  await sendEmail(
                    email,
                    "Session Payment Received - TuteSkillz",
                    emailHtml
                  );
                  console.log(`Email sent to tutor: ${email}`);
                } catch (emailErr) {
                  console.error("Failed to send email:", emailErr);
                }
              }
              resp.status(200).send("OK");
            });
          });
        } else {
          resp.status(200).send("OK");
        }
      }
    );
  });
}

router.post("/payhere/create", (req, res) => {
  const { student, sessionId } = req.body;

  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

  // Use env var for notify URL or fallback to the hardcoded one
  const notifyUrl =
    process.env.PAYHERE_NOTIFY_URL ||
    "https://chokingly-dandiacal-kiesha.ngrok-free.dev/api/payment/payhere/webhook";

  if (!merchantId || !merchantSecret) {
    console.error("PayHere credentials missing in .env");
    return res.status(500).json({ error: "Server configuration error" });
  }

  const amount = "1000.00";
  const currency = "LKR";

  const hashedSecret = CryptoJS.MD5(merchantSecret).toString().toUpperCase();
  const raw = merchantId + String(sessionId) + amount + currency + hashedSecret;

  const hash = CryptoJS.MD5(raw).toString().toUpperCase();

  const paymentData = {
    merchant_id: merchantId,
    return_url: `http://localhost:5173/session/${sessionId}`,
    cancel_url: `http://localhost:5173/session/${sessionId}`,
    notify_url: notifyUrl,
    order_id: String(sessionId),
    items: "TuteSkillz Session Fee",
    amount,
    currency,
    first_name: student.fullName.split(" ")[0],
    last_name: student.fullName.split(" ").slice(1).join(" "),
    email: student.email,
    phone: student.phone,
    address: student.street,
    city: student.city,
    country: "Sri Lanka",
    hash,
  };

  res.json({ paymentData });
});

export default router;
