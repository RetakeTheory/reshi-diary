import ArrowIcon from "./ArrowIcon";
import Icon from "./Icon";
import SiteNav from "./SiteNav";
import Link from "next/link";
import EditableModule from "./EditableModule";
import EditableText from "./EditableText";
import { pageDocument, splitDisplayText } from "../lib/site-pages";

export default function Home() {
  const page = pageDocument("home");

  return (
    <main>
      <SiteNav />
      {page.modules.map((module) => {
        const fields = module.fields;
        if (module.id === "home-hero") {
          const title = splitDisplayText(fields.title);
          return <EditableModule module={module} key={module.id}><header className="hero shell" id="top">
            <div className="hero-copy">
              <p className="kicker"><i /> {fields.kicker}</p>
              <h1>{title.lead}{title.accent ? <><br /><span><EditableText text={title.accent} /></span></> : null}</h1>
              <p className="intro">{fields.subtitle}</p>
              <Link className="primary" href={fields.ctaHref}>{fields.cta} <ArrowIcon /></Link>
            </div>
            <div className="hero-scene" aria-hidden="true">
              <div className="aura aura-one" /><div className="aura aura-two" />
              <div className="glass-diary">
                <div className="diary-top"><span>RESHI / 2026</span><i><Icon name="spark" /></i></div>
                <div className="diary-code"><span>01</span><p>{fields.diaryStatus}</p></div>
                <div className="diary-code"><span>02</span><p>{fields.diaryQuest}</p></div>
                <h2><EditableText text={fields.diaryTitle} /></h2>
                <div className="diary-foot"><span>{fields.diaryFoot}</span><b><ArrowIcon direction="up-right" /></b></div>
              </div>
              <div className="glass-chip chip-one"><Icon name="spark" /></div>
              <div className="glass-chip chip-two"><Icon name="comment" /></div>
            </div>
          </header></EditableModule>;
        }
        if (module.id === "home-archive") return <EditableModule module={module} key={module.id}><section className="archive-portal shell" aria-labelledby="archive-title">
          <div><p>{fields.eyebrow}</p><h2 id="archive-title">{fields.title}</h2><span>{fields.description}</span></div>
          <Link className="primary" href={fields.ctaHref}>{fields.cta} <ArrowIcon /></Link><Icon name="file" className="archive-portal-icon" />
        </section></EditableModule>;
        if (module.id === "home-about") return <EditableModule module={module} key={module.id}><section className="about shell" id="about" aria-labelledby="about-title">
          <div className="avatar-scene" aria-hidden="true"><div className="avatar-card"><div className="face"><Icon name="spark" /></div><p>KEEP<br />CURIOUS</p></div><div className="mini-cube">M</div><div className="mini-sphere" /></div>
          <div className="about-copy"><p>{fields.eyebrow}</p><h2 id="about-title">{fields.title}</h2><div className="about-text"><p>{fields.paragraph1}</p><p>{fields.paragraph2}</p></div>
            <div className="contact-links"><span>{fields.socialLabel}</span><a href={fields.githubHref} target="_blank" rel="noopener noreferrer">{fields.githubLabel} <ArrowIcon direction="up-right" /></a><a href={fields.emailHref}>{fields.emailLabel} <ArrowIcon direction="up-right" /></a></div>
          </div>
        </section></EditableModule>;
        if (module.id === "home-subscribe") return <EditableModule module={module} key={module.id}><section className="subscribe" id="subscribe"><div className="shell subscribe-card">
          <div><p>{fields.eyebrow}</p><h2>{fields.title}</h2><span>{fields.description}</span></div>
          <form><label className="sr-only" htmlFor="email">邮箱地址</label><input id="email" type="email" placeholder={fields.placeholder} required /><button type="submit">{fields.cta} <ArrowIcon /></button></form><div className="mail-object" aria-hidden="true"><Icon name="spark" /></div>
        </div></section></EditableModule>;
        if (module.id === "home-footer") return <EditableModule module={module} key={module.id}><footer className="footer" id="archive">
          <div className="shell footer-top"><a className="brand" href="#top"><span>RE</span>{fields.brand}</a><p><EditableText text={fields.slogan} /></p></div>
          <div className="shell footer-bottom"><p>{fields.copyright}</p><div><span>{fields.social}</span><a href={fields.githubHref} target="_blank" rel="noopener noreferrer">{fields.github}</a><a href={fields.emailHref}>{fields.email}</a></div><a href="#top">{fields.backTop} <ArrowIcon direction="up" /></a></div>
        </footer></EditableModule>;
        return null;
      })}
    </main>
  );
}
