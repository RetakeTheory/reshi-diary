import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const configPath = resolve(process.argv[2] || "dist/server/wrangler.json");
const rustBackendOrigin = process.env.RUST_BACKEND_ORIGIN?.trim();
const requiredVars = {
  AWS_REGION: process.env.AWS_REGION || "ap-northeast-1",
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || "reshi-diary-files",
  ...(rustBackendOrigin ? { RUST_BACKEND_ORIGIN: rustBackendOrigin.replace(/\/$/, "") } : {}),
};
const requiredSecrets = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "RESEND_API_KEY",
];

const config = JSON.parse(await readFile(configPath, "utf8"));

config.keep_vars = true;
config.vars = { ...(config.vars || {}), ...requiredVars };
config.secrets = {
  ...(config.secrets || {}),
  required: [...new Set([...(config.secrets?.required || []), ...requiredSecrets])],
};

const d1Bindings = Array.isArray(config.d1_databases) ? config.d1_databases : [];
if (!d1Bindings.some((binding) => binding?.binding === "DB")) {
  throw new Error("部署已中止：生成的 Wrangler 配置缺少 DB 绑定");
}

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log(
  `Worker 绑定保护已写入 ${configPath}: ${[
    ...Object.keys(requiredVars),
    ...requiredSecrets,
    "DB",
  ].join(", ")}`,
);
