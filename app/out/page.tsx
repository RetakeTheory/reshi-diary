/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation remains reliable in the deployed Worker */
import Icon from "../Icon";

function externalTarget(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch { return null; }
}

export default async function ExternalLinkWarning({ searchParams }: { searchParams: Promise<{ url?: string | string[] }> }) {
  const target = externalTarget((await searchParams).url);
  return <main className="external-warning-page">
    <section className="external-warning-card">
      <span className="external-warning-icon"><Icon name="shield" /></span>
      <h1>{target ? "即将离开 reshi 的日记本" : "这个外链无法打开"}</h1>
      <p>{target ? "你将访问第三方网站。对方可能使用独立的隐私政策、Cookie 与账户系统，请确认网址后再继续。" : "链接缺失、格式错误，或使用了不安全的协议。"}</p>
      {target && <div className="external-warning-target"><span>目标网站</span><b>{target.hostname}</b><code>{target.toString()}</code></div>}
      <div className="external-warning-actions">
        <a href="/">返回本站</a>
        {target && <a className="external-warning-continue" href={target.toString()} rel="noopener noreferrer">确认并继续 <Icon name="external" /></a>}
      </div>
      <small>本站不会向目标网站主动传送你的账户资料；离开后请勿在陌生页面输入验证码或密码。</small>
    </section>
  </main>;
}
