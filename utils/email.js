import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Send an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML content of email
 */
export const sendEmail = async (to, subject, html) => {
  if (!to) throw new Error("Recipient email required");

  const msg = {
    to,
    from: process.env.FROM_EMAIL,
    subject,
    html,
  };

  try {
    // await sgMail.send(msg);
    console.log(
      "Email sending skipped (Credits exceeded workaround):",
      subject,
      "to",
      to
    );
  } catch (err) {
    console.error("Failed to send email:", err);
    throw err;
  }
};
