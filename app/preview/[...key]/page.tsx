import { notFound } from "next/navigation";
import ArrowIcon from "../../ArrowIcon";
import SiteNav from "../../SiteNav";
import { getFilePreviewMetadata } from "../../../lib/file-preview";
import EditableModule from "../../EditableModule";
import { pageDocument, pageModule } from "../../../lib/site-pages";
import { isSurveyFileKey } from "../../../lib/survey-file-key";
import { getApiAdmin } from "../../admin/admin-auth";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ key: string[] }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

function safeReturnPath(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/posts";
}

function encodeKey(key: string[]) {
  return key.map(encodeURIComponent).join("/");
}

function fileSize(size: number) {
  if (!size) return "大小未知";
  if (size < 1024 * 1024) return `${Math.max(1, Math.ceil(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default async function FilePreviewPage({ params, searchParams }: PageProps) {
  const keyParts = (await params).key;
  const key = keyParts.join("/");
  if (isSurveyFileKey(key) && !await getApiAdmin()) notFound();
  const metadata = await getFilePreviewMetadata(key);
  if (!metadata) notFound();

  const returnTo = safeReturnPath((await searchParams).from);
  const fromArticle = returnTo.startsWith("/posts/");
  const rawUrl = `/api/files/${encodeKey(keyParts)}`;
  const downloadUrl = `${rawUrl}?download=1`;
  const page = pageDocument("preview");
  const header = pageModule("preview", "preview-header");
  const stage = pageModule("preview", "preview-stage");
  const footer = pageModule("preview", "preview-footer");

  return (
    <main className="file-preview-page">
      <SiteNav backHref={returnTo} backLabel={fromArticle ? "返回原文章" : "返回上一页"} />

      <section className="file-reader shell">
        <EditableModule module={header}><header className="file-reader-head">
          <div className="file-reader-copy">
            <p>{header.fields.eyebrow}</p>
            <h1>{metadata.filename}</h1>
            <div className="file-reader-meta">
              <span>{metadata.contentType.split(";", 1)[0]}</span>
              <span>{fileSize(metadata.size)}</span>
            </div>
          </div>
          <div className="file-reader-actions">
            {metadata.previewable && metadata.mode && <a href={rawUrl} target="_blank" rel="noopener noreferrer">{header.fields.open}</a>}
            <a className="primary" href={downloadUrl}>{header.fields.download}</a>
          </div>
        </header></EditableModule>

        <EditableModule module={stage}><div className={`file-reader-stage mode-${metadata.mode || "unsupported"}`}>
          {metadata.previewable && metadata.mode === "image" && (
            // The file endpoint streams arbitrary image dimensions, so Next Image cannot know a stable layout size here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rawUrl} alt={metadata.filename} />
          )}
          {metadata.previewable && metadata.mode === "pdf" && (
            <iframe src={rawUrl} title={`${metadata.filename} PDF 阅读器`} />
          )}
          {metadata.previewable && metadata.mode === "text" && (
            <iframe src={rawUrl} title={`${metadata.filename} 文本阅读器`} sandbox="" />
          )}
          {metadata.previewable && metadata.mode === "browser" && (
            <iframe src={rawUrl} title={`${metadata.filename} 在线阅读器`} sandbox="" />
          )}
          {(!metadata.previewable || !metadata.mode) && (
            <div className="file-reader-empty">
              <span>FILE</span>
              <h2>{stage.fields.unsupportedTitle}</h2>
              <p>{stage.fields.unsupportedDescription}</p>
              <a href={downloadUrl}>{stage.fields.unsupportedCta}</a>
            </div>
          )}
        </div></EditableModule>

        {page.modules.some((module) => module.id === footer.id) && <EditableModule module={footer}><footer className="file-reader-foot">
          <a href={returnTo}><ArrowIcon direction="left" /> {fromArticle ? footer.fields.backArticle : footer.fields.back}</a>
          <small>{footer.fields.note}</small>
        </footer></EditableModule>}
      </section>
    </main>
  );
}

