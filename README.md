
## GitHub 自动部署到 Cloudflare Worker

仓库内的 [Deploy Worker](.github/workflows/deploy-worker.yml) 工作流会在代码推送到 `main` 后自动构建并部署，也可以在 GitHub 的 **Actions → Deploy Worker → Run workflow** 中手动一键发布。

首次使用前，在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加两个 Repository secrets：

- `CLOUDFLARE_API_TOKEN`：Cloudflare API Token，至少授予 Workers Scripts 编辑、Workers Routes 编辑以及 D1 读取权限。
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID。

运行时密钥继续在 Cloudflare Worker 的 **Settings → Variables and Secrets** 中维护；工作流使用 `--keep-vars`，部署时不会覆盖这些值。

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## Rust 后端

新的 Axum 后端位于 [`backend/`](backend/README.md)，提供邮箱登录、管理员会话、文章 CRUD、公开文章读取和附件上传/下载接口。

默认部署仍使用现有 Cloudflare D1 后端。部署 Rust 服务并设置 Worker 变量 `RUST_BACKEND_ORIGIN` 后，Worker 会把 `/api/*` 请求代理到 Rust 服务，服务端渲染也会改从 Rust API 读取文章。切换前必须迁移 D1 数据，并为 Rust 服务挂载持久化卷。

