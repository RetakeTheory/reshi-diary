import { ADMIN_EMAIL } from "./admin-email-auth";

export type AdminMailFailure = "unconfigured" | "invalid_key" | "testing_recipient" | "sender_unverified" | "rejected" | "unavailable";
type MailResult = { ok: true } | { ok: false; reason: AdminMailFailure };

function classifyResendFailure(status: number, detail: string): AdminMailFailure {
  const normalized = detail.toLowerCase();
  if (normalized.includes("invalid_api_key") || normalized.includes("api key is invalid") || status === 401) return "invalid_key";
  if (normalized.includes("only send testing emails") || normalized.includes("testing emails to your own email")) return "testing_recipient";
  if (normalized.includes("domain") && normalized.includes("not verified")) return "sender_unverified";
  return "rejected";
}

export async function sendAdminLoginCode(code: string): Promise<MailResult> {
  const { env } = await import("cloudflare:workers");
  const apiKey = env.RESEND_API_KEY?.trim();
  const recipient = env.ADMIN_EMAIL?.trim().toLowerCase() || ADMIN_EMAIL;
  const from = env.RESEND_FROM?.trim();
  if (!apiKey || !recipient || !from) return { ok: false, reason: "unconfigured" };

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: `【reshi 的日记本】登录验证码 ${code}`,
        text: `你的管理员登录验证码是：${code}\n\n验证码 10 分钟内有效，仅可使用一次。如果不是你本人操作，请忽略这封邮件。`,
        html: `<div style="margin:0;padding:32px;background:#f4f2ff;color:#171827;font-family:system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif"><div style="max-width:520px;margin:auto;padding:30px;border:1px solid #ded8ff;border-radius:24px;background:#fff;box-shadow:0 16px 50px rgba(63,48,140,.12)"><p style="margin:0 0 18px;color:#7657f6;font-size:12px;font-weight:800;letter-spacing:.14em">RESHI'S DIARY</p><h1 style="margin:0 0 10px;font-size:25px">管理员登录验证码</h1><p style="margin:0;color:#6b6e7c;line-height:1.8">你正在登录 reshi 的日记本后台。</p><div style="margin:26px 0;padding:20px;border-radius:16px;background:#eeeaff;color:#6748ee;font-size:34px;font-weight:850;letter-spacing:10px;text-align:center">${code}</div><p style="margin:0;color:#808291;font-size:13px;line-height:1.8">验证码 10 分钟内有效，仅可使用一次。请勿转发给任何人。</p></div></div>`,
      }),
    });
  } catch (error) {
    console.error("Admin login email request failed", error instanceof Error ? error.message : error);
    return { ok: false, reason: "unavailable" };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Resend rejected admin login email", response.status, detail);
    return { ok: false, reason: classifyResendFailure(response.status, detail) };
  }
  return { ok: true };
}
