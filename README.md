
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

新的 Axum 后端位于 [`backend/`](backend/README.md)，提供管理员与普通读者邮箱登录、双角色 Passkey、文章 CRUD、头像、积分等级、每日任务、评论/回复/回应、工单、全站通知和附件上传/下载接口。

部署 Rust 服务并挂载持久化卷后，可在 GitHub **Settings → Secrets and variables → Actions → Variables** 中设置可选变量 `RUST_BACKEND_ORIGIN`；Worker 会把全部 `/api/*` 请求代理到该服务。未配置时自动使用 Worker 内置的 D1 API，读者登录等功能不会中断。切换到 Rust 前必须迁移现有 D1 数据。

普通读者采用无密码邮箱验证码注册/登录。Passkey 在读者账户页登记；头像会在浏览器端裁成正方形后上传。每日签到、评论和回应分别奖励 2、3、3 积分，每项每日最多奖励一次；每 100 分升级，最高 16 级。管理员可处理读者工单，并发布一条当前生效的顶部通知。
