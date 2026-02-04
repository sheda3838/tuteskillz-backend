// backend/routes/payment.route.js
import { Router } from "express";
import db from "../config/db.js";
import Stripe from "stripe";
import { sendEmail } from "../utils/email.js";
import { generateEmailHTML } from "../utils/emailTemplate.js";

const router = Router();

// Initialize Stripe with the provided secret key
// NOTE: In production, move these to .env (process.env.STRIPE_SECRET_KEY)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Helper to generate Zoom (Jitsi) Link
function generateJitsiLink(sessionId) {
  const timestamp = Date.now();
  const roomName = `session_${sessionId}_${timestamp}`;
  return `https://meet.jit.si/${roomName}`;
}

// 1. Create Checkout Session
router.post("/stripe/create-checkout-session", async (req, res) => {
  const { student, sessionId } = req.body;
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

  if (!sessionId || !student) {
    return res.status(400).json({ error: "Missing sessionId or student data" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "lkr",
            product_data: {
              name: "TuteSkillz Session Fee",
              description: `Session ID: ${sessionId} - Student: ${student.fullName}`,
            },
            unit_amount: 1000 * 100, // 1000 LKR in cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${FRONTEND_URL}/session/${sessionId}?payment_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/session/${sessionId}?payment_status=cancelled`,
      metadata: {
        sessionId: sessionId.toString(),
        studentId: student.userId ? student.userId.toString() : "",
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe Create Session Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Verify Payment (Called by Frontend on Success)
// NOTE: Webhooks are more secure, but this is a faster manual verification for your flow
router.post("/stripe/verify-payment", async (req, res) => {
  const { sessionId, checkoutSessionId } = req.body;

  if (!sessionId || !checkoutSessionId) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required fields" });
  }

  try {
    // 1. Retrieve the session from Stripe to verify it is actually paid
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

    if (
      session.payment_status === "paid" &&
      session.metadata.sessionId === sessionId.toString()
    ) {
      // 2. Check if already marked as Paid to avoid duplicates
      const checkSql = "SELECT sessionStatus FROM session WHERE sessionId = ?";
      db.query(checkSql, [sessionId], async (err, rows) => {
        if (err)
          return res.status(500).json({ success: false, message: err.message });

        if (rows.length > 0 && rows[0].sessionStatus === "Paid") {
          return res.json({ success: true, message: "Already processed" });
        }

        // 3. Update Custom DB
        const zoomUrl = generateJitsiLink(sessionId);
        const updateSql =
          "UPDATE session SET sessionStatus = 'Paid', zoomUrl = ? WHERE sessionId = ?";

        db.query(updateSql, [zoomUrl, sessionId], async (updateErr) => {
          if (updateErr)
            return res
              .status(500)
              .json({ success: false, message: updateErr.message });

          // 4. Insert Payment Record
          const insertPaymentSql = `
            INSERT INTO payment (sessionId, amount, currency, paymentStatus, paymentMethod, provider, transactionId) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;
          const paymentParams = [
            sessionId,
            session.amount_total / 100, // Amount in major units
            session.currency.toUpperCase(),
            "Paid",
            "Card",
            "Stripe",
            session.payment_intent, // Transaction ID
          ];

          db.query(insertPaymentSql, paymentParams, (payErr) => {
            if (payErr) console.error("Failed to log payment:", payErr);
          });

          // 5. Send Email to Tutor
          const tutorQuery = `
            SELECT u.email, u.fullName
            FROM session s
            JOIN tutorSubject ts ON s.tutorSubjectId = ts.tutorSubjectId
            JOIN users u ON ts.tutorId = u.userId
            WHERE s.sessionId = ?
          `;

          db.query(tutorQuery, [sessionId], async (tErr, tRows) => {
            if (tRows && tRows.length > 0) {
              const { email, fullName } = tRows[0];
              try {
                await sendEmail(
                  email,
                  "Session Payment Received - TuteSkillz",
                  generateEmailHTML({
                    title: "Payment Received!",
                    message: `Hello ${fullName}, payment for Session #${sessionId} has been verified.`,
                    buttonText: "Go to Session",
                    buttonUrl: `${process.env.FRONTEND_URL}/session/${sessionId}`,
                  }),
                );
              } catch (e) {
                console.error("Email send failed", e);
              }
            }
          });

          return res.json({
            success: true,
            message: "Payment verified and session updated",
          });
        });
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Payment not completed or invalid session",
      });
    }
  } catch (error) {
    console.error("Payment Verification Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
