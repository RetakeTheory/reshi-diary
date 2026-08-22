import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vinextCli = resolve(projectRoot, "node_modules", "vinext", "dist", "cli.js");
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/run-vinext.mjs <dev|build|start>");
  process.exit(1);
}

const child = spawn(process.execPath, [vinextCli, ...args], {
  cwd: projectRoot,
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: resolve(projectRoot, ".wrangler", "wrangler.log"),
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Unable to start vinext: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
