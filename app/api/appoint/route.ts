import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

const COOKIE = "__Host-appoint";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 60;

function tokenFrom(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  return cookie.match(/(?:^|;\s*)__Host-appoint=([a-f0-9]{64})(?:;|$)/)?.[1] || null;
}

function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function session(token: string) { return env.DHU_COURSE.getByName(`visitor:${token}`); }

async function forward(token: string, path: string, method: "GET" | "POST", body?: unknown) {
  const response = await session(token).fetch(new Request(`https://dhu.internal${path}`, {
    method, headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  }));
  return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const token = tokenFrom(request) || newToken();
  const response = await forward(token, "/status", "GET");
  if (!tokenFrom(request)) response.headers.set("Set-Cookie", `${COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
  return response;
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const token = tokenFrom(request);
  if (!token) return Response.json({ error: "请刷新页面后重试" }, { status: 401 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "请求格式无效" }, { status: 415 });
  const input = await request.json().catch(() => null) as { action?: string; [key: string]: unknown } | null;
  const path = ({ startLogin: "/login/start", sendCode: "/login/code", finishLogin: "/login/finish",
    openCoursePage: "/login/course", addTask: "/task", cancelTask: "/task/cancel" })[
    input?.action as "startLogin" | "sendCode" | "finishLogin" | "openCoursePage" | "addTask" | "cancelTask"];
  if (!path) return Response.json({ error: "操作不支持" }, { status: 400 });
  return forward(token, path, "POST", input);
}
