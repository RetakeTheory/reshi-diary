import Icon from "../Icon";
import EditableModule from "../EditableModule";
import { pageModule } from "../../lib/site-pages";

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
  const editableModule = pageModule("externalLink", "external-link-warning");
  const copy = editableModule.fields;
  return <main className="external-warning-page">
    <EditableModule module={editableModule}><section className="external-warning-card">
      <span className="external-warning-icon"><Icon name="shield" /></span>
      <h1>{target ? copy.validTitle : copy.invalidTitle}</h1>
      <p>{target ? copy.validDescription : copy.invalidDescription}</p>
      {target && <div className="external-warning-target"><span>{copy.targetLabel}</span><b>{target.hostname}</b><code>{target.toString()}</code></div>}
      <div className="external-warning-actions">
        <a href={copy.backHref}>{copy.back}</a>
        {target && <a className="external-warning-continue" href={target.toString()} rel="noopener noreferrer">{copy.continue} <Icon name="external" /></a>}
      </div>
      <small>{copy.privacyNote}</small>
    </section></EditableModule>
  </main>;
}
