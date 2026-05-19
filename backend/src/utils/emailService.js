import nodemailer from "nodemailer";

const createTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

export const sendVerificationEmail = async (
  toEmail,
  toName,
  verificationUrl,
) => {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"Settl" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: "Verify your Settl account ✉️",
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>Verify your Settl account</title>
</head>
<body style="margin:0;padding:0;background-color:#e8edf5;font-family:'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e8edf5;padding:48px 16px;">
    <tr>
      <td align="center" valign="top">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8 0%,#1e40af 100%);border-radius:20px 20px 0 0;padding:44px 40px 38px;text-align:center;border:1px solid #1e40af;border-bottom:none;">

              <!-- Logo pill -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="text-align:center;">
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;background:rgba(255,255,255,0.15);border-radius:16px;padding:12px 28px;">
                      <tr>
                        <td valign="middle">
                          <span style="font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-1.5px;font-family:'Segoe UI',Arial,sans-serif;">Settl</span>
                        </td>
                        <td valign="middle" style="padding-left:5px;padding-top:10px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td width="9" height="9" style="width:9px;height:9px;border-radius:5px;background:#4ade80;font-size:0;line-height:0;">&nbsp;</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Tagline -->
              <p style="margin:0 0 18px;color:rgba(219,234,254,0.9);font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">
                Split now. Settl later.
              </p>

              <!-- Headline -->
              <h1 style="margin:0 0 10px;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;line-height:1.25;">
                Verify your email &#127881;
              </h1>

              <!-- Sub-headline -->
              <p style="margin:0;color:rgba(219,234,254,0.85);font-size:14px;line-height:1.6;">
                You're almost in &mdash; one click to activate your account.
              </p>

            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 0;border:1px solid #e5e7eb;border-top:none;border-bottom:none;">

              <!-- Greeting -->
              <p style="margin:0 0 6px;color:#111827;font-size:16px;font-weight:700;line-height:1.5;">
                Hey ${toName} &#128075;
              </p>
              <p style="margin:0 0 36px;color:#6b7280;font-size:14px;line-height:1.8;">
                Thanks for signing up for <strong style="color:#1d4ed8;">Settl</strong> &mdash; the smartest way to split expenses with friends. Click the button below to confirm your email and unlock your account.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 40px;">
                <tr>
                  <td align="center" style="border-radius:14px;background:linear-gradient(135deg,#2563eb,#1d4ed8);">
                    <a href="${verificationUrl}"
                       style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:17px 52px;border-radius:14px;letter-spacing:0.3px;white-space:nowrap;">
                      &#9993;&nbsp; Verify My Email &nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider with label -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td style="border-top:1px solid #e5e7eb;width:40%;"></td>
                  <td style="padding:0 14px;white-space:nowrap;color:#9ca3af;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:0.1em;">What happens next</td>
                  <td style="border-top:1px solid #e5e7eb;width:40%;"></td>
                </tr>
              </table>

              <!-- 3 Step cards -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:32px;">

                <tr><td style="padding-bottom:10px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
                    <tr><td style="padding:16px 20px;">
                      <table cellpadding="0" cellspacing="0" border="0"><tr>
                        <td valign="middle" style="padding-right:16px;">
                          <table cellpadding="0" cellspacing="0" border="0"><tr>
                            <td width="36" height="36" style="width:36px;height:36px;border-radius:18px;background:#16a34a;text-align:center;vertical-align:middle;font-size:18px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;line-height:36px;">&#10003;</td>
                          </tr></table>
                        </td>
                        <td valign="middle">
                          <p style="margin:0;color:#111827;font-size:13.5px;font-weight:700;line-height:1.3;">Your account gets fully activated</p>
                          <p style="margin:3px 0 0;color:#6b7280;font-size:12px;">Your profile is live and ready to go</p>
                        </td>
                      </tr></table>
                    </td></tr>
                  </table>
                </td></tr>

                <tr><td style="padding-bottom:10px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
                    <tr><td style="padding:16px 20px;">
                      <table cellpadding="0" cellspacing="0" border="0"><tr>
                        <td valign="middle" style="padding-right:16px;">
                          <table cellpadding="0" cellspacing="0" border="0"><tr>
                            <td width="36" height="36" style="width:36px;height:36px;border-radius:18px;background:#16a34a;text-align:center;vertical-align:middle;font-size:18px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;line-height:36px;">&#10003;</td>
                          </tr></table>
                        </td>
                        <td valign="middle">
                          <p style="margin:0;color:#111827;font-size:13.5px;font-weight:700;line-height:1.3;">Create groups and add expenses</p>
                          <p style="margin:3px 0 0;color:#6b7280;font-size:12px;">Trips, flatmates, dinners &mdash; track it all</p>
                        </td>
                      </tr></table>
                    </td></tr>
                  </table>
                </td></tr>

                <tr><td>
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
                    <tr><td style="padding:16px 20px;">
                      <table cellpadding="0" cellspacing="0" border="0"><tr>
                        <td valign="middle" style="padding-right:16px;">
                          <table cellpadding="0" cellspacing="0" border="0"><tr>
                            <td width="36" height="36" style="width:36px;height:36px;border-radius:18px;background:#16a34a;text-align:center;vertical-align:middle;font-size:18px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;line-height:36px;">&#10003;</td>
                          </tr></table>
                        </td>
                        <td valign="middle">
                          <p style="margin:0;color:#111827;font-size:13.5px;font-weight:700;line-height:1.3;">Settle up with friends via UPI</p>
                          <p style="margin:3px 0 0;color:#6b7280;font-size:12px;">Zero math, zero awkwardness</p>
                        </td>
                      </tr></table>
                    </td></tr>
                  </table>
                </td></tr>

              </table>

              <!-- Expiry warning -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;">
                    <table cellpadding="0" cellspacing="0" border="0"><tr>
                      <td valign="top" style="padding-right:12px;font-size:20px;line-height:1;">&#9200;</td>
                      <td>
                        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.7;">
                          <strong>This link expires in 48 hours.</strong><br/>
                          <span style="color:#b45309;font-size:12px;">If it expires, you can request a new link from your Settl dashboard.</span>
                        </p>
                      </td>
                    </tr></table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #f3f4f6;margin:0 0 24px;" />

              <!-- Fallback URL -->
              <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;">Button not working? Copy and paste this link into your browser:</p>
              <p style="margin:0 0 32px;font-size:11px;line-height:1.6;word-break:break-all;">
                <a href="${verificationUrl}" style="color:#2563eb;text-decoration:none;">${verificationUrl}</a>
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 20px 20px;padding:24px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;">
                <tr>
                  <td valign="middle" style="padding-right:6px;">
                    <span style="font-size:16px;font-weight:800;color:#1d4ed8;letter-spacing:-0.5px;font-family:'Segoe UI',Arial,sans-serif;">Settl</span>
                  </td>
                  <td valign="middle" style="padding-top:4px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="7" height="7" style="width:7px;height:7px;border-radius:4px;background:#4ade80;font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle" style="padding-left:8px;">
                    <span style="font-size:13px;color:#9ca3af;font-style:italic;">Split now. Settl later.</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 5px;color:#9ca3af;font-size:11px;">Sent to <span style="color:#6b7280;">${toEmail}</span></p>
              <p style="margin:0;color:#9ca3af;font-size:11px;">&copy; 2026 Settl &nbsp;&middot;&nbsp; If you didn't sign up, you can safely ignore this email.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
    `.trim(),
  });
};
