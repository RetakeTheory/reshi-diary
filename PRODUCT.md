# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- 普通读者：阅读 reshi 的文章、注册账户、登录、添加评论、回复和文章回应。
- 管理员：写作与发布文章、管理 Passkey，并发布或撤下站内通知。

## Product Purpose

reshi 的个人日记与内容存档站。成功意味着文章易于发现和阅读，读者能安全参与讨论，管理员能独立完成内容与通知管理。

## Positioning

个人日记、轻量互动工具与社区回应集中在同一处，保持作者主导、低噪声的阅读体验。

## Operating Context

读者主要通过桌面与手机浏览器访问。文章是独立阅读页面；文章目录独立于主页。管理员通过受保护后台维护内容与全站通知。

## Capabilities and Constraints

- 前端基于 React 19、vinext 与 Cloudflare Worker；Rust Axum + SQLite 是正式后端，Worker 必须通过 `RUST_BACKEND_ORIGIN` 连接它。
- 登录采用邮箱验证码，无密码；普通用户与管理员会话隔离。
- 普通用户可登记和使用 Passkey；邮箱验证保留为恢复路径。
- 上传图片必须可内联预览，并支持查看器放大、缩小和关闭。
- 评论、回复及文章回应要求普通用户登录。
- 管理员可发布一条当前生效通知并选择纯色背景；长通知在顶部横幅滚动展示。
- 全站图形操作使用一致的 SVG 图标，不以 emoji 或 Unicode 符号代替图标。

## Brand Commitments

- 保留“reshi 的日记本”名称、现有中文语气、浅紫色系与可切换主题/强调色。
- 保留现有吉祥物与文章阅读风格；本次为功能扩展，不重做品牌。

## Evidence on Hand

- 现有首页、文章页、插件页与管理后台代码位于 `app/`。
- 现有 Rust 服务、SQLite 迁移和 WebAuthn 管理员 Passkey 实现位于 `backend/`。
- 没有可引用的商业数据、用户评价或外部品牌资产；后续工作不得虚构。

## Product Principles

- 阅读优先：主页保持轻，文章目录和正文各司其职。
- 安全参与：先验证身份，再允许公开互动。
- 可恢复认证：Passkey 提速，邮箱验证兜底。
- 管理闭环：常用内容与通知操作不依赖改代码。
- 移动端直达：小屏以一个清晰菜单承载导航。

## Accessibility & Inclusion

支持键盘操作、可见焦点、语义化状态提示、减少动态效果偏好和移动端触控目标。
