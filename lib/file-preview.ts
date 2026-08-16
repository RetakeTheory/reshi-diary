import { findUploadMetadata } from "../db/uploads";
import { decodeS3Filename, headS3Object } from "./s3-storage";

export type FilePreviewMode = "image" | "pdf" | "text";

export type FilePreviewMetadata = {
  filename: string;
  contentType: string;
  size: number;
  previewable: boolean;
  mode: FilePreviewMode | null;
};

const SAFE_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const SAFE_TEXT_TYPES = new Set([
  "application/json",
  "application/toml",
  "application/xml",
  "application/x-yaml",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/x-c",
  "text/x-c++",
  "text/x-java-source",
  "text/x-python",
  "text/x-ruby",
  "text/x-rust",
  "text/xml",
  "text/yaml",
]);

const SAFE_TEXT_EXTENSIONS = new Set([
  "bash", "c", "cc", "conf", "cpp", "css", "csv", "cxx", "go", "h", "hpp", "ini",
  "java", "js", "json", "jsx", "kt", "kts", "less", "log", "md", "markdown", "py",
  "rb", "rs", "scss", "sh", "sql", "swift", "toml", "ts", "tsx", "txt", "xml", "yaml",
  "yml", "zsh",
]);

function baseContentType(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

function extension(filename: string) {
  const match = filename.toLowerCase().match(/\.([a-z0-9+#-]+)$/);
  return match?.[1] || "";
}

export function previewModeFor(contentType: string, filename: string): FilePreviewMode | null {
  const type = baseContentType(contentType);
  if (type === "application/pdf") return "pdf";
  if (SAFE_IMAGE_TYPES.has(type)) return "image";
  if (SAFE_TEXT_TYPES.has(type) || type.startsWith("text/x-") || SAFE_TEXT_EXTENSIONS.has(extension(filename))) return "text";
  return null;
}

export function storedContentType(contentType: string, filename: string) {
  const mode = previewModeFor(contentType, filename);
  if (mode === "text") return "text/plain; charset=utf-8";
  return baseContentType(contentType) || "application/octet-stream";
}

export async function getFilePreviewMetadata(key: string): Promise<FilePreviewMetadata | null> {
  if (key.startsWith("uploads/")) {
    try {
      const response = await headS3Object(key);
      if (response.ok) {
        const filename = decodeS3Filename(response.headers.get("x-amz-meta-filename"));
        const contentType = response.headers.get("content-type") || "application/octet-stream";
        const previewable = response.headers.get("x-amz-meta-previewable") === "1";
        return {
          filename,
          contentType,
          size: Number(response.headers.get("content-length")) || 0,
          previewable,
          mode: previewable ? previewModeFor(contentType, filename) : null,
        };
      }
      if (response.status !== 404) {
        console.error(JSON.stringify({ event: "s3_preview_metadata_failed", status: response.status }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "s3_preview_metadata_error",
        reason: error instanceof Error ? error.message : "unknown",
      }));
    }
  }

  const object = await findUploadMetadata(key);
  if (!object) return null;
  const previewable = object.previewable === 1;
  return {
    filename: object.filename || "attachment",
    contentType: object.content_type || "application/octet-stream",
    size: object.size || 0,
    previewable,
    mode: previewable ? previewModeFor(object.content_type, object.filename) : null,
  };
}

