
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

新的 Axum 后端位于 [`backend/`](backend/README.md)，提供管理员与普通读者邮箱登录、双角色 Passkey、文章 CRUD、评论/回复/回应、全站通知和附件上传/下载接口。

Rust 服务是正式后端。先部署服务并挂载持久化卷，再在 GitHub **Settings → Secrets and variables → Actions → Variables** 中设置必需变量 `RUST_BACKEND_ORIGIN`；Worker 会把全部 `/api/*` 请求代理到该服务。变量缺失时 API 会明确返回 503，部署工作流也会中止。切换前必须迁移现有 D1 数据。

普通读者采用无密码邮箱验证码注册/登录。Passkey 在读者账户页登记；评论、回复与文章回应需要读者会话。管理员可在后台发布一条当前生效的通知，通知会显示为全站顶部 Banner。
