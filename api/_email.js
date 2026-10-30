// Verification-code email, sent through Brevo's transactional API from noreply@experimentai.dev.
// Built for Gmail's code detection: the code is in the subject, in the first line of the text version,
// and set apart on its own in the HTML, next to the words "verification code".
import { randomUUID } from 'node:crypto';
import { HttpError } from './_shared.js';

const SITE = 'https://experimentai.dev';
const SENDER = { name: 'Experiment AI', email: 'noreply@experimentai.dev' };

export async function sendCodeEmail(to, code) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new HttpError(503, 'Email verification isn’t set up yet. Please try again later.');

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to }],
      subject: `${code} is your Experiment AI verification code`,
      htmlContent: html(code),
      textContent: text(code),
      // A unique id per email stops Gmail from threading every code into one conversation.
      headers: { 'X-Entity-Ref-ID': randomUUID() },
      tags: ['verification-code'],
    }),
  });
  if (!res.ok) {
    console.error('Brevo error', res.status, await res.text());
    throw new HttpError(502, 'We couldn’t send the email. Please try again in a moment.');
  }
}

const text = (code) => `Your Experiment AI verification code is ${code}

Enter this code to confirm your email and save your spot on the waitlist. It expires in 10 minutes.

If you didn't request this, you can ignore this email.

Experiment AI by Experiment Labs
${SITE}
`;

const html = (code) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Your Experiment AI verification code</title>
</head>
<body style="margin:0;padding:0;background:#e9eff5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your verification code is ${code}. It expires in 10 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e9eff5;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:24px;">
      <tr><td align="center" style="padding:40px 32px 8px;">
        <img src="${SITE}/assets/email-logo.png" width="72" height="72" alt="Experiment AI" style="display:block;border:0;width:72px;height:72px;">
      </td></tr>
      <tr><td align="center" style="padding:4px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:600;letter-spacing:-0.4px;color:#0d1626;">
        Experiment <i style="font-family:Georgia,'Times New Roman',serif;font-weight:400;">AI</i>
      </td></tr>
      <tr><td align="center" style="padding:28px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:#33415a;">
        Your verification code is
      </td></tr>
      <tr><td align="center" style="padding:4px 32px 4px;">
        <div style="display:inline-block;padding:14px 26px;border-radius:16px;background:#f1f5f9;font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#0d1626;">${code}</div>
      </td></tr>
      <tr><td align="center" style="padding:20px 40px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:#5b6a82;">
        Enter this code to confirm your email and save your spot on the waitlist. It expires in 10 minutes.<br><br>
        If you didn’t request this, you can ignore this email.
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
      <tr><td align="center" style="padding:20px 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#7a879b;">
        Experiment AI by Experiment Labs · <a href="${SITE}" style="color:#7a879b;">experimentai.dev</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
