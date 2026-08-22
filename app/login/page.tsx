import SiteNav from "../SiteNav";
import UserLogin from "./UserLogin";

type PageProps = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: PageProps) {
  const raw = (await searchParams).next;
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const next = candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/account";
  return <main className="user-auth-page">
    <SiteNav backHref="/" backLabel="返回首页" />
    <section className="user-auth-shell shell">
      <div className="user-auth-copy"><p>READER ACCOUNT / 读者账户</p><h1>来坐一会，<br /><span>一起聊聊。</span></h1><p>邮箱验证码无需密码；登录后可评论、回复、添加回应，并登记 Passkey。</p></div>
      <UserLogin next={next} />
    </section>
  </main>;
}
