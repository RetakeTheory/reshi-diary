import { ADMIN_EMAIL } from "./admin-email-auth";

type MailResult = { ok: true } | { ok: false; unconfigured: boolean };

export async function sendAdminLoginCode(code: string): Promise<MailResult> {
  const { env } = await import("cloudflare:workers");
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, unconfigured: true };

  const from = env.RESEND_FROM?.trim() || "reshi 的日记本 <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [ADMIN_EMAIL],
      subject: `【reshi 的日记本】登录验证码 ${code}`,
      text: `你的管理员登录验证码是：${code}\n\n验证码 10 分钟内有效，仅可使用一次。如果不是你本人操作，请忽略这封邮件。`,
      html: `<div style="margin:0;padding:32px;background:#f4f2ff;color:#171827;font-family:system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif"><div style="max-width:520px;margin:auto;padding:30px;border:1px solid #ded8ff;border-radius:24px;background:#fff;box-shadow:0 16px 50px rgba(63,48,140,.12)"><p style="margin:0 0 18px;color:#7657f6;font-size:12px;font-weight:800;letter-spacing:.14em">RESHI'S DIARY</p><h1 style="margin:0 0 10px;font-size:25px">管理员登录验证码</h1><p style="margin:0;color:#6b6e7c;line-height:1.8">你正在登录 reshi 的日记本后台。</p><div style="margin:26px 0;padding:20px;border-radius:16px;background:#eeeaff;color:#6748ee;font-size:34px;font-weight:850;letter-spacing:10px;text-align:center">${code}</div><p style="margin:0;color:#808291;font-size:13px;line-height:1.8">验证码 10 分钟内有效，仅可使用一次。请勿转发给任何人。</p></div></div>`,
    }),
  });

  if (!response.ok) {
    console.error("Resend rejected admin login email", response.status, await response.text().catch(() => ""));
    return { ok: false, unconfigured: false };
  }
  return { ok: true };
}
