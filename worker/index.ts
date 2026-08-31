/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  RUST_BACKEND_ORIGIN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

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
  async fetch(request: Request, env: Env | undefined, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    let routedRequest = request;

    if (url.hostname === "admin.rettheory.top") {
      if (url.pathname === "/") url.pathname = "/admin/pages";
      else if (url.pathname === "/login") url.pathname = "/admin/login";
      else if (url.pathname === "/dashboard") url.pathname = "/admin";
      if (url.href !== request.url) routedRequest = new Request(url, request);
    }

    if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/admin/site-pages")) {
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
      if (!env?.IMAGES || !env.ASSETS) return new Response("Image service unavailable", { status: 503 });
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(routedRequest, env ?? {}, ctx);
  },
};

export default worker;
