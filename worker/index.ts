/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { oneBotTokenHash } from "../lib/onebot-cloudflare";
import { OneBotSession } from "./onebot-session";
import { ensureDatabaseSchema } from "../db/runtime";

export { OneBotSession };

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const RUST_SAFE_TIMEOUT_MS = 6_000;
const RUST_MUTATION_TIMEOUT_MS = 15_000;
const RUST_RETRY_STATUSES = new Set([502, 503, 504]);

function rustUnavailable(status = 504) {
  return Response.json({ error: "服务暂时繁忙，请稍后重试" }, {
    status,
    headers: { "Cache-Control": "no-store", "Retry-After": "2" },
  });
}

async function proxyRustApi(request: Request, upstream: URL) {
  const method = request.method.toUpperCase();
  const safe = method === "GET" || method === "HEAD";
  const attempts = safe ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(new Request(upstream, {
        method,
        headers: request.headers,
        body: safe ? undefined : request.body,
        redirect: "manual",
        signal: AbortSignal.timeout(safe ? RUST_SAFE_TIMEOUT_MS : RUST_MUTATION_TIMEOUT_MS),
      }));
      if (safe && attempt + 1 < attempts && RUST_RETRY_STATUSES.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 150));
        continue;
      }
      return response;
    } catch (error) {
      console.warn(JSON.stringify({ event: "rust_api_proxy_failed", path: upstream.pathname, method,
        attempt: attempt + 1, reason: error instanceof Error ? error.message : "unknown" }));
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        continue;
      }
    }
  }
  return rustUnavailable();
}

async function warmRustBackend(env: Cloudflare.Env) {
  const origin = env.RUST_BACKEND_ORIGIN?.trim();
  if (!origin) return;
  try {
    const response = await fetch(new URL("/healthz", origin), {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) console.warn(JSON.stringify({ event: "rust_backend_warm_failed", status: response.status }));
    await response.body?.cancel().catch(() => undefined);
  } catch (error) {
    console.warn(JSON.stringify({ event: "rust_backend_warm_failed",
      reason: error instanceof Error ? error.message : "unknown" }));
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Cloudflare.Env | undefined, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    let routedRequest = request;

    if (url.hostname === "admin.rettheory.top") {
      if (url.pathname === "/") url.pathname = "/admin/pages";
      else if (url.pathname === "/login") url.pathname = "/admin/login";
      else if (url.pathname === "/dashboard") url.pathname = "/admin";
      if (url.href !== request.url) routedRequest = new Request(url, request);
    }

    if (url.pathname === "/api/onebot/ws") {
      if (!env?.DB || !env.ONEBOT) return Response.json({ error: "OneBot 实时服务尚未部署" }, { status: 503 });
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const provided = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
      if (!provided) return new Response("Unauthorized", { status: 401 });
      const bot = await env.DB.prepare("SELECT bot_id FROM onebot_bots WHERE access_token_hash = ? AND enabled = 1 LIMIT 1")
        .bind(await oneBotTokenHash(provided)).first<{ bot_id: string }>();
      if (!bot) return new Response("Unauthorized", { status: 401 });
      const headers = new Headers(request.headers);
      headers.delete("authorization");
      headers.set("x-reshi-onebot-id", bot.bot_id);
      return env.ONEBOT.getByName(bot.bot_id).fetch(new Request(request, { headers }));
    }

    const cloudflareOneBotApi = url.pathname.startsWith("/api/auth/qq/")
      || url.pathname === "/api/account/qq"
      || url.pathname.startsWith("/api/account/qq/")
      || url.pathname === "/api/admin/onebot"
      || url.pathname.startsWith("/api/admin/onebot/");
    const d1PluginApi = url.pathname === "/api/roll-call"
      || url.pathname === "/api/food-rankings" || url.pathname.startsWith("/api/food-rankings/")
      || url.pathname === "/api/admin/food-rankings" || url.pathname.startsWith("/api/admin/food-rankings/");
    if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/admin/site-pages") && !cloudflareOneBotApi && !d1PluginApi) {
      const origin = env?.RUST_BACKEND_ORIGIN?.trim();
      if (origin) {
        const upstream = new URL(`${url.pathname}${url.search}`, origin);
        const headers = new Headers(routedRequest.headers);
        headers.set("X-Forwarded-Host", url.host);
        headers.set("X-Forwarded-Proto", url.protocol.slice(0, -1));
        return proxyRustApi(new Request(routedRequest, { headers }), upstream);
      }
    }

    if (url.pathname === "/_vinext/image") {
      const images = env?.IMAGES;
      const assets = env?.ASSETS;
      if (!images || !assets) return new Response("Image service unavailable", { status: 503 });
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => assets.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await images.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(routedRequest, env ?? {}, ctx);
  },
  async scheduled(controller: { scheduledTime: number }, env: Cloudflare.Env) {
    await ensureDatabaseSchema();
    const rows = await env.DB.prepare(`SELECT DISTINCT bot_id FROM onebot_scheduled_messages
      WHERE due_at <= ? AND (claimed_at IS NULL OR claimed_at < ?)
      UNION SELECT bot_id FROM onebot_bots WHERE enabled = 1 LIMIT 50`)
      .bind(controller.scheduledTime, controller.scheduledTime - 60_000).all<{ bot_id: string }>();
    await Promise.allSettled([
      warmRustBackend(env),
      ...(rows.results || []).map((row) => env.ONEBOT.getByName(row.bot_id).processDue(row.bot_id, controller.scheduledTime)),
    ]);
  },
};

export default worker;
