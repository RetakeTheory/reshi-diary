import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getAdminSession } from "../admin-auth";
import EmailLogin from "./EmailLogin";
import ArrowIcon from "../../ArrowIcon";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");
  return (
    <main className="login-page">
      <a className="brand login-brand" href="/"><span>RE</span>reshi 的日记本</a>
      <section className="login-card">
        <div className="login-mark">✦</div>
        <p>ADMIN ACCESS / 管理员登录</p>
        <h1>验证码会直接<br />发送到邮箱。</h1>
        <EmailLogin email={ADMIN_EMAIL} />
        <p className="login-note">验证码仅在 10 分钟内有效，验证后立即失效。本网站不会保存邮箱密码。</p>
        <a className="login-back" href="/"><ArrowIcon direction="left" /> 返回首页</a>
      </section>
    </main>
  );
}
