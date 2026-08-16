import { notFound } from "next/navigation";
import Link from "next/link";
import ArrowIcon from "../../ArrowIcon";
import { getFilePreviewMetadata } from "../../../lib/file-preview";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ key: string[] }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

function safeReturnPath(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/#posts";
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
  const metadata = await getFilePreviewMetadata(key);
  if (!metadata) notFound();

  const returnTo = safeReturnPath((await searchParams).from);
  const fromArticle = returnTo.startsWith("/posts/");
  const rawUrl = `/api/files/${encodeKey(keyParts)}`;
  const downloadUrl = `${rawUrl}?download=1`;

  return (
    <main className="file-preview-page">
      <nav className="nav shell file-preview-nav">
        <Link className="brand" href="/"><span>RE</span>reshi的日记本</Link>
        <a className="article-back" href={returnTo}>
          <ArrowIcon direction="left" /> {fromArticle ? "返回原文章" : "返回上一页"}
        </a>
      </nav>

      <section className="file-reader shell">
        <header className="file-reader-head">
          <div className="file-reader-copy">
            <p>ATTACHMENT READER / 附件阅读器</p>
            <h1>{metadata.filename}</h1>
            <div className="file-reader-meta">
              <span>{metadata.contentType.split(";", 1)[0]}</span>
              <span>{fileSize(metadata.size)}</span>
            </div>
          </div>
          <div className="file-reader-actions">
            {metadata.previewable && metadata.mode && <a href={rawUrl} target="_blank" rel="noopener noreferrer">新窗口打开</a>}
            <a className="primary" href={downloadUrl}>下载文件</a>
          </div>
        </header>

        <div className={`file-reader-stage mode-${metadata.mode || "unsupported"}`}>
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
          {(!metadata.previewable || !metadata.mode) && (
            <div className="file-reader-empty">
              <span>FILE</span>
              <h2>这个格式暂时不能在线读</h2>
              <p>浏览器没法安全地直接打开它，不过文件本体还在，可以下载后用本地应用查看。</p>
              <a href={downloadUrl}>下载到本地</a>
            </div>
          )}
        </div>

        <footer className="file-reader-foot">
          <a href={returnTo}><ArrowIcon direction="left" /> {fromArticle ? "读完了，回到原文章" : "返回上一页"}</a>
          <small>预览由站内文件流直接提供，不会把附件转交给第三方阅读服务。</small>
        </footer>
      </section>
    </main>
  );
}

