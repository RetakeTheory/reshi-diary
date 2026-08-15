import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "../../chatgpt-auth";
import { ADMIN_EMAIL, getAdminAccess } from "../admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const user = await getChatGPTUser();
  const admin = user ? await getAdminAccess(user) : null;

  return (
    <main className="login-page">
      <a className="brand login-brand" href="/"><span>RE</span>reshi 的日记本</a>
      <section className="login-card">
        <div className="login-mark">✦</div>
        <p>ADMIN ACCESS / 管理员登录</p>
        <h1>用邮箱验证码<br />进入日记后台。</h1>
        <label><span>管理员邮箱</span><input value={ADMIN_EMAIL} readOnly aria-label="管理员邮箱" /></label>
        {admin ? (
          <><div className="login-status success">邮箱身份已验证</div><a className="login-action" href="/admin">进入文章后台 →</a></>
        ) : user ? (
          <><div className="login-status">当前登录邮箱不是管理员邮箱</div><a className="login-action" href={chatGPTSignOutPath("/admin/login")}>切换邮箱并接收验证码 →</a></>
        ) : (
          <><p className="login-note">验证码由安全登录页发送，本网站不会保存邮箱密码或验证码。</p><a className="login-action" href={chatGPTSignInPath("/admin")}>发送验证码并登录 →</a></>
        )}
        <a className="login-back" href="/">← 返回首页</a>
      </section>
    </main>
  );
}
