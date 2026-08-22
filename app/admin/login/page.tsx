import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getAdminSession } from "../admin-auth";
import EmailLogin from "./EmailLogin";
import ArrowIcon from "../../ArrowIcon";
import Link from "next/link";
import Icon from "../../Icon";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");
  return (
    <main className="login-page">
      <Link className="brand login-brand" href="/"><span>RE</span>reshi 的日记本</Link>
      <section className="login-card">
        <div className="login-mark"><Icon name="spark" /></div>
        <p>ADMIN ACCESS / 返回存档点</p>
        <h1>欢迎回来，<br />存档员。</h1>
        <EmailLogin email={ADMIN_EMAIL} />
        <p className="login-note">验证码小纸条会飞到邮箱，10 分钟内有效；也可以用 Passkey 一键回城。</p>
        <Link className="login-back" href="/"><ArrowIcon direction="left" /> 返回首页</Link>
      </section>
    </main>
  );
}
