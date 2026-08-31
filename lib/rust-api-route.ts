import { rustBackendFetch } from "./rust-backend";

export async function forwardRustApi(request: Request) {
  const url = new URL(request.url);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await rustBackendFetch(`${url.pathname}${url.search}`, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  });
  return response ?? Response.json({ error: "Rust 后端未配置" }, { status: 503 });
}
