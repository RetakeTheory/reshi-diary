import SiteNav from "../SiteNav";
import UserLogin from "./UserLogin";
import EditableModule from "../EditableModule";
import EditableText from "../EditableText";
import { pageDocument, splitDisplayText } from "../../lib/site-pages";

type PageProps = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: PageProps) {
  const raw = (await searchParams).next;
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const next = candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/account";
  const page = pageDocument("login");
  return <main className="user-auth-page">
    <SiteNav backHref="/" backLabel="返回首页" />
    <section className="user-auth-shell shell">
      {page.modules.map((module) => {
        if (module.id === "login-intro") {
          const title = splitDisplayText(module.fields.title);
          return <EditableModule module={module} key={module.id}><div className="user-auth-copy"><p>{module.fields.eyebrow}</p><h1>{title.lead}{title.accent && <><br /><span><EditableText text={title.accent} /></span></>}</h1><p>{module.fields.description}</p></div></EditableModule>;
        }
        if (module.id === "login-form") return <EditableModule module={module} key={module.id}><UserLogin next={next} /></EditableModule>;
        return null;
      })}
    </section>
  </main>;
}
