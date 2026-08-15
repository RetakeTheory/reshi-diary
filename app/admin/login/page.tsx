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
        <h1>安全登录，<br />由你选择。</h1>
        <EmailLogin email={ADMIN_EMAIL} />
        <p className="login-note">验证码会发送到管理员邮箱且仅在 10 分钟内有效；设置 Passkey 后也可直接使用设备验证。</p>
        <a className="login-back" href="/"><ArrowIcon direction="left" /> 返回首页</a>
      </section>
    </main>
  );
}
