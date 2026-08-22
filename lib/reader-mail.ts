type MailResult = { ok: true } | { ok: false; unconfigured: boolean };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export async function sendReaderLoginCode(email: string, code: string): Promise<MailResult> {
  const { env } = await import("cloudflare:workers");
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, unconfigured: true };
  const from = env.RESEND_FROM?.trim() || "reshi 的日记本 <onboarding@resend.dev>";
  const safeCode = escapeHtml(code);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `【reshi 的日记本】读者验证码 ${code}`,
      text: `你的读者验证码是：${code}\n\n验证码 10 分钟内有效，仅可使用一次。`,
      html: `<div style="padding:32px;background:#f4f2ff;font-family:system-ui,'Microsoft YaHei',sans-serif"><div style="max-width:520px;margin:auto;padding:30px;border-radius:24px;background:#fff"><p style="color:#7657f6;font-size:12px;font-weight:800">RESHI'S DIARY</p><h1 style="font-size:25px">读者登录验证码</h1><div style="margin:26px 0;padding:20px;border-radius:16px;background:#eeeaff;color:#6748ee;font-size:34px;font-weight:850;letter-spacing:10px;text-align:center">${safeCode}</div><p style="color:#808291;font-size:13px">10 分钟内有效，请勿转发给任何人。</p></div></div>`,
    }),
  });
  if (!response.ok) {
    console.error("Resend rejected reader login email", response.status);
    return { ok: false, unconfigured: false };
  }
  return { ok: true };
}
