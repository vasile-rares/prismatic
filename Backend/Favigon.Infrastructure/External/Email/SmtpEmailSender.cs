using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Favigon.Application.Interfaces;

namespace Favigon.Infrastructure.External.Email;

public class SmtpEmailSender : IEmailSender
{
  private readonly IConfiguration _configuration;

  public SmtpEmailSender(IConfiguration configuration)
  {
    _configuration = configuration;
  }

  public Task SendPasswordResetEmailAsync(string toEmail, string resetUrl, int tokenLifetimeMinutes)
  {
    var encodedUrl = WebUtility.HtmlEncode(resetUrl);

    var logoStream = typeof(SmtpEmailSender).Assembly
      .GetManifestResourceStream("Favigon.Infrastructure.External.Email.Resources.favigon-text.png");

    var htmlBody = $$"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body bgcolor="#0b0b0c" style="margin:0;padding:0;background-color:#0b0b0c;font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#f0f0f0;-webkit-font-smoothing:antialiased;">
  <table width="100%" bgcolor="#0b0b0c" cellpadding="0" cellspacing="0" border="0" style="background-color:#0b0b0c;">
    <tr>
      <td align="center" bgcolor="#0b0b0c" style="padding:48px 24px;background-color:#0b0b0c;">
        <table width="480" bgcolor="#0b0b0c" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background-color:#0b0b0c;">

          <!-- Logo -->
          <tr>
            <td align="center" bgcolor="#0b0b0c" style="padding-bottom:28px;background-color:#0b0b0c;">
              <img src="cid:favigon-logo" alt="Favigon" width="169" height="50" style="display:inline-block;border:0;object-fit:cover;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="#111111" style="background-color:#111111;border-radius:24px;border:1.5px solid #ffffff;padding:32px;">

              <!-- Title -->
              <h1 style="font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#ffffff;margin:0 0 10px;">Reset your password</h1>
              <p style="font-size:14px;font-weight:500;line-height:1.6;color:#c2c2c2;margin:0 0 28px;">We received a request to reset the password for your Favigon account. Click the button below to choose a new password.</p>

              <!-- Button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="{{encodedUrl}}" style="display:inline-block;background-color:#ff85d0;color:#0d0d0d;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:999px;letter-spacing:0.01em;">Reset Password</a>
              </div>

              <!-- Expiry note -->
              <p style="font-size:13px;font-weight:500;line-height:1.6;color:#c2c2c2;margin:0 0 28px;">This link will expire in <span style="color:#ff85d0;font-weight:600;">{{tokenLifetimeMinutes}} minutes</span>. If you did not request this, you can safely ignore this email.</p>

              <!-- Fallback URL -->
              <p style="font-size:11px;line-height:1.6;color:#555555;margin:0 0 20px;">If the button doesn't work, copy this link into your browser:<br /><a href="{{encodedUrl}}" style="color:#888888;word-break:break-all;">{{encodedUrl}}</a></p>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                <tr>
                  <td bgcolor="#2a2a2a" height="1" style="background-color:#2a2a2a;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Footer -->
              <p style="font-size:12px;line-height:1.6;color:#666666;margin:0;">© 2026 Favigon. All rights reserved.</p>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  <div style="display:none;font-size:1px;color:#0b0b0c;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
</body>
</html>
""";

    var textBody =
      "Reset your Favigon password" + Environment.NewLine +
      Environment.NewLine +
      "We received a request to reset the password for your Favigon account." + Environment.NewLine +
      $"Click this link to reset your password (expires in {tokenLifetimeMinutes} minutes):" + Environment.NewLine +
      resetUrl + Environment.NewLine +
      Environment.NewLine +
      "If you did not request this, you can safely ignore this email.";

    return SendEmailWithInlineImageAsync(toEmail, "Reset your Favigon password", htmlBody, textBody, logoStream);
  }

  public Task SendPasswordSetConfirmationEmailAsync(string toEmail)
  {
    var logoStream = typeof(SmtpEmailSender).Assembly
      .GetManifestResourceStream("Favigon.Infrastructure.External.Email.Resources.favigon-text.png");

    var htmlBody = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're all set</title>
</head>
<body bgcolor="#0b0b0c" style="margin:0;padding:0;background-color:#0b0b0c;font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#f0f0f0;-webkit-font-smoothing:antialiased;">
  <table width="100%" bgcolor="#0b0b0c" cellpadding="0" cellspacing="0" border="0" style="background-color:#0b0b0c;">
    <tr>
      <td align="center" bgcolor="#0b0b0c" style="padding:48px 24px;background-color:#0b0b0c;">
        <table width="480" bgcolor="#0b0b0c" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background-color:#0b0b0c;">

          <!-- Logo -->
          <tr>
            <td align="center" bgcolor="#0b0b0c" style="padding-bottom:28px;background-color:#0b0b0c;">
              <img src="cid:favigon-logo" alt="Favigon" width="169" height="50" style="display:inline-block;border:0;object-fit:cover;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="#111111" style="background-color:#111111;border-radius:24px;border:1.5px solid #ffffff;padding:32px;">

              <!-- Title -->
              <h1 style="font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#ffffff;margin:0 0 10px;">You're all set</h1>
              <p style="font-size:14px;font-weight:500;line-height:1.6;color:#c2c2c2;margin:0 0 16px;">This is a confirmation that your sign-in details were updated for your Favigon account.</p>
              <p style="font-size:14px;font-weight:500;line-height:1.6;color:#c2c2c2;margin:0 0 28px;">You can now sign in with your email and password. If you didn't make this change, please contact support right away.</p>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                <tr>
                  <td bgcolor="#2a2a2a" height="1" style="background-color:#2a2a2a;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Footer -->
              <p style="font-size:12px;line-height:1.6;color:#666666;margin:0;">© 2026 Favigon. All rights reserved.</p>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  <div style="display:none;font-size:1px;color:#0b0b0c;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
</body>
</html>
""";

    var textBody =
      "You're all set" + Environment.NewLine +
      Environment.NewLine +
      "This is a confirmation that your sign-in details were updated for your Favigon account." + Environment.NewLine +
      "You can now sign in with your email and password." + Environment.NewLine +
      Environment.NewLine +
      "If you didn't make this change, please contact support right away.";

    return SendEmailWithInlineImageAsync(toEmail, "Your Favigon sign-in details were updated", htmlBody, textBody, logoStream);
  }

  public Task SendTwoFactorCodeEmailAsync(string toEmail, string code, string purpose, int expirationMinutes)
  {
    var (subject, title, intro, closing) = purpose switch
    {
      "enable" => (
        "Confirm two-factor authentication",
        "Confirm two-factor authentication",
        "Use the verification code below to turn on two-factor authentication for your Favigon account.",
        "If you didn't request this, you can safely ignore this email."),
      "disable" => (
        "Turn off two-factor authentication",
        "Turn off two-factor authentication",
        "Use the verification code below to turn off two-factor authentication for your Favigon account.",
        "If you didn't request this, please review your account security settings."),
      _ => (
        "Your Favigon verification code",
        "Verify it's you",
        "Use the verification code below to finish signing in to your Favigon account.",
        "If you didn't try to sign in, you can safely ignore this email."),
    };

    var encodedCode = WebUtility.HtmlEncode(code);

    var codeDigitsHtml = string.Concat(code.Select(c =>
      $"<span style=\"display:inline-block;width:1.5ch;text-align:center;border-bottom:3px solid #ff85d0;padding-bottom:0px;margin:0 3px;\">{WebUtility.HtmlEncode(c.ToString())}</span>"
    ));

    var logoStream = typeof(SmtpEmailSender).Assembly
      .GetManifestResourceStream("Favigon.Infrastructure.External.Email.Resources.favigon-text.png");

    var htmlBody = $$"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{subject}}</title>
</head>
<body bgcolor="#0b0b0c" style="margin:0;padding:0;background-color:#0b0b0c;font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#f0f0f0;-webkit-font-smoothing:antialiased;">
  <table width="100%" bgcolor="#0b0b0c" cellpadding="0" cellspacing="0" border="0" style="background-color:#0b0b0c;">
    <tr>
      <td align="center" bgcolor="#0b0b0c" style="padding:48px 24px;background-color:#0b0b0c;">
        <table width="480" bgcolor="#0b0b0c" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;background-color:#0b0b0c;">

          <!-- Logo -->
          <tr>
            <td align="center" bgcolor="#0b0b0c" style="padding-bottom:28px;background-color:#0b0b0c;">
              <img src="cid:favigon-logo" alt="Favigon" width="169" height="50" style="display:inline-block;border:0;object-fit:cover;" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="#111111" style="background-color:#111111;border-radius:24px;border:1.5px solid #ffffff;padding:32px;">

              <!-- Title -->
              <h1 style="font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#ffffff;margin:0 0 10px;">{{title}}</h1>
              <p style="font-size:14px;font-weight:500;line-height:1.6;color:#c2c2c2;margin:0 0 28px;">{{intro}}</p>

              <!-- Code block -->
              <div style="text-align:center;margin-bottom:28px;">
                <div style="font-size:30px;font-weight:700;color:#ff85d0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Courier New',monospace;letter-spacing:0.05em;margin-bottom:15px;">
                  {{codeDigitsHtml}}
                </div>
                <span style="font-size:12px;font-weight:500;color:#888888;letter-spacing:0.01em;">Available for <span style="color:#cccccc;font-weight:500;">{{expirationMinutes}} minutes</span></span>
              </div>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                <tr>
                  <td bgcolor="#2a2a2a" height="1" style="background-color:#2a2a2a;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Footer -->
              <p style="font-size:12px;line-height:1.6;color:#666666;margin:0;">© 2026 Favigon. All rights reserved.</p>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  <!-- Anti-Gmail-signature spacer -->
  <div style="display:none;font-size:1px;color:#0b0b0c;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
</body>
</html>
""";

    var textBody =
      subject + Environment.NewLine +
      Environment.NewLine +
      intro + Environment.NewLine +
      Environment.NewLine +
      $"Verification code: {code}" + Environment.NewLine +
      $"This code expires in {expirationMinutes} minutes." + Environment.NewLine +
      Environment.NewLine +
      closing;

    return SendEmailWithInlineImageAsync(toEmail, subject, htmlBody, textBody, logoStream);

  }

  private async Task SendEmailWithInlineImageAsync(string toEmail, string subject, string htmlBody, string? textBody, System.IO.Stream? imageStream)
  {
    var smtpHost = _configuration["Email:SmtpHost"];
    var fromEmail = _configuration["Email:FromEmail"];

    if (string.IsNullOrWhiteSpace(smtpHost) || string.IsNullOrWhiteSpace(fromEmail))
    {
      throw new InvalidOperationException("Email sending is not configured on the server.");
    }

    var fromName = _configuration["Email:FromName"];
    var smtpPort = _configuration.GetValue<int?>("Email:SmtpPort") ?? 587;
    var enableSsl = _configuration.GetValue<bool?>("Email:EnableSsl") ?? true;
    var username = _configuration["Email:SmtpUsername"];
    var password = _configuration["Email:SmtpPassword"];

    using var message = new MailMessage
    {
      From = string.IsNullOrWhiteSpace(fromName)
        ? new MailAddress(fromEmail)
        : new MailAddress(fromEmail, fromName),
      Subject = subject,
    };

    message.To.Add(toEmail);

    if (!string.IsNullOrWhiteSpace(textBody))
    {
      message.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(textBody, null, "text/plain"));
    }

    var htmlView = AlternateView.CreateAlternateViewFromString(htmlBody, null, "text/html");

    if (imageStream != null)
    {
      var logo = new LinkedResource(imageStream, "image/png") { ContentId = "favigon-logo", TransferEncoding = System.Net.Mime.TransferEncoding.Base64 };
      htmlView.LinkedResources.Add(logo);
    }

    message.AlternateViews.Add(htmlView);

    using var client = new SmtpClient(smtpHost, smtpPort)
    {
      EnableSsl = enableSsl,
      DeliveryMethod = SmtpDeliveryMethod.Network,
    };

    if (!string.IsNullOrWhiteSpace(username))
    {
      client.Credentials = new NetworkCredential(username, password);
    }

    await client.SendMailAsync(message);
  }
}