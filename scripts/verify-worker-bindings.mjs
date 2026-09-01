const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const scriptName = process.env.CLOUDFLARE_WORKER_NAME || "reshi-diary";
const rustBackendOrigin = process.env.RUST_BACKEND_ORIGIN?.trim().replace(/\/$/, "");

if (!accountId || !apiToken) {
  throw new Error("无法验证生产绑定：缺少 Cloudflare 凭据");
}

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/settings`,
  { headers: { Authorization: `Bearer ${apiToken}` } },
);
const payload = await response.json();

if (!response.ok || !payload.success) {
  throw new Error(`读取 Worker 绑定失败（HTTP ${response.status}）`);
}

const bindings = new Map(
  (payload.result?.bindings || []).map((binding) => [binding.name, binding]),
);
const required = [
  ["AWS_REGION", "plain_text", process.env.AWS_REGION || "ap-northeast-1"],
  ["AWS_S3_BUCKET", "plain_text", process.env.AWS_S3_BUCKET || "reshi-diary-files"],
  ...(rustBackendOrigin ? [["RUST_BACKEND_ORIGIN", "plain_text", rustBackendOrigin]] : []),
  ["AWS_ACCESS_KEY_ID", "secret_text"],
  ["AWS_SECRET_ACCESS_KEY", "secret_text"],
  ["RESEND_API_KEY", "secret_text"],
  ["DB", "d1"],
  ["ONEBOT", "durable_object_namespace"],
];

const problems = [];
for (const [name, type, expectedText] of required) {
  const binding = bindings.get(name);
  if (!binding) {
    problems.push(`${name} 缺失`);
    continue;
  }
  if (binding.type !== type) problems.push(`${name} 类型为 ${binding.type}，预期 ${type}`);
  if (expectedText && binding.text !== expectedText) problems.push(`${name} 的值不正确`);
}

if (problems.length) {
  throw new Error(`生产绑定校验失败：${problems.join("；")}`);
}

console.log(`Worker ${scriptName} 的 S3、邮件、D1 与 OneBot Durable Object 绑定校验通过${rustBackendOrigin ? "，非 OneBot API 的 Rust 代理已启用" : "，当前使用 D1 API"}`);
