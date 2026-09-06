export type RollCallIdentity = { id: string; displayName: string; kind: "reader" | "admin" };
type IdentityProviders = {
  d1Reader: () => Promise<{ id: string; display_name: string } | null>;
  rustReader: (token: string) => Promise<Response | null>;
  admin: () => Promise<{ email: string; displayName: string } | null>;
};
function cookie(request: Request, name: string) {
  return (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="))?.slice(name.length + 1) || "";
}

// Storage stays in D1; authentication follows the site's existing session providers.
export async function resolveRollCallIdentity(request: Request, providers: IdentityProviders): Promise<RollCallIdentity | null> {
  const token = cookie(request, "reshi_user_session");
  if (/^[a-f0-9]{64}$/.test(token)) {
    const local = await providers.d1Reader();
    if (local) return { id: local.id, displayName: local.display_name, kind: "reader" };
    const response = await providers.rustReader(token);
    if (response && response.status !== 401 && response.status !== 403) {
      if (!response.ok) throw new Error("网站登录服务暂时不可用");
      const payload = await response.json() as { user?: { id?: unknown; displayName?: unknown } };
      if (typeof payload.user?.id !== "string" || !payload.user.id || payload.user.id.length > 128 || typeof payload.user.displayName !== "string") throw new Error("网站登录服务返回了无效的账户信息");
      // Namespace Rust IDs so unrelated identities in two databases never share records.
      return { id: `rust:${payload.user.id}`, displayName: payload.user.displayName, kind: "reader" };
    }
  }
  if (cookie(request, "reshi_admin_session")) {
    const admin = await providers.admin();
    if (admin) return { id: `admin:${admin.email}`, displayName: admin.displayName, kind: "admin" };
  }
  return null;
}
