export async function getRustBackendOrigin() {
  try {
    const { env } = await import("cloudflare:workers");
    const value = env.RUST_BACKEND_ORIGIN?.trim();
    return value ? value.replace(/\/$/, "") : null;
  } catch {
    const value = process.env.RUST_BACKEND_ORIGIN?.trim();
    return value ? value.replace(/\/$/, "") : null;
  }
}

export async function rustBackendFetch(path: string, init?: RequestInit) {
  const origin = await getRustBackendOrigin();
  if (!origin) return null;
  const url = `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  const method = (init?.method || "GET").toUpperCase();
  const attempts = method === "GET" || method === "HEAD" ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, cache: "no-store", signal: init?.signal || AbortSignal.timeout(6_000) });
      if (attempt + 1 < attempts && [502, 503, 504].includes(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 150));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Rust backend unavailable");
}
