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
  return fetch(`${origin}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    cache: "no-store",
  });
}


