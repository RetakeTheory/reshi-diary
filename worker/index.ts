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
    if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/admin/site-pages") && !cloudflareOneBotApi) {
      const origin = env?.RUST_BACKEND_ORIGIN?.trim();
      if (origin) {
        const upstream = new URL(`${url.pathname}${url.search}`, origin);
        const headers = new Headers(routedRequest.headers);
        headers.set("X-Forwarded-Host", url.host);
        headers.set("X-Forwarded-Proto", url.protocol.slice(0, -1));
        return fetch(new Request(upstream, { method: routedRequest.method, headers, body: routedRequest.body, redirect: "manual" }));
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
      WHERE due_at <= ? AND (claimed_at IS NULL OR claimed_at < ?) LIMIT 50`)
      .bind(controller.scheduledTime, controller.scheduledTime - 60_000).all<{ bot_id: string }>();
    await Promise.allSettled((rows.results || []).map((row) => env.ONEBOT.getByName(row.bot_id).processDue(row.bot_id, controller.scheduledTime)));
  },
};

export default worker;
