import ArrowIcon from "../ArrowIcon";
import Icon from "../Icon";
import SiteNav from "../SiteNav";
import EditableModule from "../EditableModule";
import EditableText from "../EditableText";
import { pageDocument, splitDisplayText } from "../../lib/site-pages";

export default function PluginsPage() {
  const page = pageDocument("plugins");
  const header = page.modules.find((module) => module.id === "plugins-header")!;
  const title = splitDisplayText(header.fields.title);
  const cards = page.modules.filter((module) => module.type === "pluginCard");
  const art = {
    "plugin-food-card": { className: "", icon: "food" as const, marker: "spark" as const },
    "plugin-random-card": { className: "number-art", icon: "dice" as const, marker: "02" },
    "plugin-wheel-card": { className: "wheel-art", icon: "wheel" as const, marker: "03" },
  };
  return (
    <main className="plugins-page">
      <SiteNav />
      <EditableModule module={header}><header className="plugin-directory-head shell"><p>{header.fields.eyebrow}</p><h1>{title.lead}{title.accent && <><br /><span><EditableText text={title.accent} /></span></>}</h1><p>{header.fields.description}</p></header></EditableModule>
      <section className="plugin-grid shell" aria-label="插件目录">
        {cards.map((module) => {
          const visual = art[module.id as keyof typeof art];
          return <EditableModule module={module} key={module.id}><a className="plugin-card" href={module.fields.href} data-module-id={module.id}>
            <div className={`plugin-card-art ${visual.className}`} aria-hidden="true"><span><Icon name={visual.icon} /></span><i>{typeof visual.marker === "string" ? visual.marker : <Icon name={visual.marker} />}</i></div>
            <div><small>{module.fields.eyebrow}</small><h2>{module.fields.title}</h2><p>{module.fields.description}</p><b>{module.fields.cta} <ArrowIcon /></b></div>
          </a></EditableModule>;
        })}
      </section>
    </main>
  );
}
