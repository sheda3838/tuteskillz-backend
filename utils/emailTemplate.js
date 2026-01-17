export const generateEmailHTML = ({
  title,
  message,
  buttonText,
  buttonUrl,
  additionalNotes = "",
}) => `
<div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f6f8; padding: 40px; text-align: center;">
  <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 10px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <img src="/assets/Logo.png" alt="TuteSkillz Logo" style="width: 80px; margin-bottom: 20px;" />
    <h2 style="color: #2a2a2a;">${title}</h2>
    <p style="color: #555; font-size: 16px; line-height: 1.6;">
      ${message}
    </p>
    ${additionalNotes ? `<p style="color: #555; font-size: 14px; margin-top:10px;">${additionalNotes}</p>` : ""}
    ${buttonText && buttonUrl ? `<a href="${buttonUrl}"
       style="display: inline-block; background-color: #0078ff; color: #fff; text-decoration: none;
              padding: 12px 30px; border-radius: 6px; margin-top: 20px; font-weight: bold; font-size: 16px;">
      ${buttonText}
    </a>` : ""}
  </div>
</div>
`;
