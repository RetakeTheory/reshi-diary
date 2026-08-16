
## GitHub 自动部署到 Cloudflare Worker

仓库内的 [Deploy Worker](.github/workflows/deploy-worker.yml) 工作流会在代码推送到 `main` 后自动构建并部署，也可以在 GitHub 的 **Actions → Deploy Worker → Run workflow** 中手动一键发布。

首次使用前，在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加两个 Repository secrets：

- `CLOUDFLARE_API_TOKEN`：Cloudflare API Token，至少授予 Workers Scripts 编辑、Workers Routes 编辑以及 D1 读取权限。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID。

运行时密钥继续在 Cloudflare Worker 的 **Settings → Variables and Secrets** 中维护；工作流使用 `--keep-vars`，部署时不会覆盖这些值。

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
