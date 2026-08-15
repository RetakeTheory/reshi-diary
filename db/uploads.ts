type UploadRow = {
  key: string;
  filename: string;
  content_type: string;
  size: number;
  previewable: number;
  data: ArrayBuffer | number[];
};

async function getD1() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("D1 database binding DB is unavailable");
  return env.DB;
}

export async function saveUpload(input: {
  key: string;
  filename: string;
  contentType: string;
  size: number;
  previewable: boolean;
  data: ArrayBuffer;
}) {
  const db = await getD1();
  await db
    .prepare(
      "INSERT INTO uploads (key, filename, content_type, size, previewable, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      input.key,
      input.filename,
      input.contentType,
      input.size,
      input.previewable ? 1 : 0,
      new Uint8Array(input.data),
      Date.now(),
    )
    .run();
}

export async function findUpload(key: string) {
  const db = await getD1();
  return db
    .prepare(
      "SELECT key, filename, content_type, size, previewable, data FROM uploads WHERE key = ? LIMIT 1",
    )
    .bind(key)
    .first<UploadRow>();
}

export function uploadBody(data: UploadRow["data"]) {
  return data instanceof ArrayBuffer ? data : Uint8Array.from(data).buffer;
}
