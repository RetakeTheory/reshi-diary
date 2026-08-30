/* eslint-disable @next/next/no-html-link-for-pages -- full-page navigation remains reliable in the deployed Worker */
import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getAdminSession } from "../admin-auth";
import EmailLogin from "./EmailLogin";
import ArrowIcon from "../../ArrowIcon";
import Icon from "../../Icon";
import EditableModule from "../../EditableModule";
import EditableText from "../../EditableText";
import { pageModule } from "../../../lib/site-pages";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");
  const loginModule = pageModule("adminLogin", "admin-login-card");
  const fields = loginModule.fields;
  return (
    <main className="login-page">
      <a className="brand login-brand" href="/"><span>RE</span>reshi 的日记本</a>
      <EditableModule module={loginModule}><section className="login-card">
        <div className="login-mark"><Icon name="spark" /></div>
        <p>{fields.eyebrow}</p>
        <h1><EditableText text={fields.title} /></h1>
        <EmailLogin email={ADMIN_EMAIL} />
        <p className="login-note">{fields.note}</p>
        <a className="login-back" href="/"><ArrowIcon direction="left" /> {fields.back}</a>
      </section></EditableModule>
    </main>
  );
}
