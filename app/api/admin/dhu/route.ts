import { env } from "cloudflare:workers";
import { getApiAdmin } from "../../../admin/admin-auth";
import { sameOrigin } from "../../../../lib/admin-email-auth";

export const dynamic = "force-dynamic";

function session() { return env.DHU_COURSE.getByName("admin"); }

async function forward(path: string, method: "GET" | "POST", body?: unknown) {
  const response = await session().fetch(new Request(`https://dhu.internal${path}`, {
    method, headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  }));
  return new Response(response.body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  return forward("/status", "GET");
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await getApiAdmin()) return Response.json({ error: "请先登录管理员账户" }, { status: 401 });
  const input = await request.json().catch(() => null) as { action?: string; [key: string]: unknown } | null;
  const path = ({ startLogin: "/login/start", finishLogin: "/login/finish", addTask: "/task", cancelTask: "/task/cancel" })[input?.action as "startLogin" | "finishLogin" | "addTask" | "cancelTask"];
  if (!path) return Response.json({ error: "操作不支持" }, { status: 400 });
  return forward(path, "POST", input);
}
