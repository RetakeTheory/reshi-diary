# 整站模块编辑器

## 使用方式

线上管理端：

```text
https://admin.rettheory.top/
```

使用管理员邮箱/Passkey 登录后即可编辑整站模块。也可以在项目根目录运行本地编辑器：

```powershell
pnpm run text:edit
```

保持命令窗口开启，在浏览器访问 `http://localhost:3789/`。本地编辑器适合开发预览；生产内容编辑请使用 `admin.rettheory.top`。

1. 顶部选择页面；“全站导航”可修改各页面共用的导航文字。编辑器现在包含外链隐私提示、问卷在线报表和动画地图等最新页面。
2. 左侧选择模块，拖动可排序的模块；圆点按钮控制显示或隐藏。
3. 右侧修改文字、站内路径、HTTPS 链接或邮箱链接，并调整模块留白、对齐和宽度。网址字段会标明链接类型、即时提示格式错误，右侧箭头可单独测试链接。
4. 中间是模块结构预览，可切换桌面、平板和手机宽度，也可用 `Ctrl+Z` 撤销。它用于确认内容层级与顺序，不替代发布后在真实网站页面中的最终样式检查。
5. 顶部“打开页面”会打开当前真实页面；带动态参数的页面需从网站内进入。线上点击“保存管理端草稿”会把草稿保存到 D1；确认后点击“创建发布 PR”，管理端只提交 `src/content/site-pages.json` 到独立分支并创建 GitHub PR，等待 Actions 通过后再合并。线上编辑器不会直接改写生产分支。

线上发布需要 Cloudflare Worker secret `GITHUB_TOKEN`，权限至少包括该仓库的 Contents 读写和 Pull requests 读写；可选 `GITHUB_REPOSITORY` 默认为 `RetakeTheory/reshi-diary`。Cloudflare 中还需将 `admin.rettheory.top` DNS 记录设为代理状态，使 Worker route 生效。

线上“同步 GitHub”会重新读取 `main` 的最新页面配置，并保留同版本的管理端草稿；如果 `main` 已变化，发布会被拒绝，需先同步，避免覆盖其他人的修改。

本地编辑器仍保留原有 Git 发布能力，但线上管理端不依赖管理员电脑上的 Git，也不会把 GitHub token 暴露给浏览器。

## 内容与功能边界

`src/content/site-pages.json` 是页面模块、文字和安全布局选项的唯一内容源。`src/content/site-pages.draft.json` 是本机草稿，已加入 `.gitignore`。多标签页同时编辑时会检查草稿版本并拒绝静默覆盖；若发布期间服务意外中断，下次启动会从本机备份恢复已发布配置，同时保留草稿。

所有页面都出现在编辑器中。文章正文继续由管理后台维护；文章列表、账户积分、工单、附件预览、登录表单和小游戏等动态数据或功能逻辑不会变成任意 HTML。编辑器只开放预先登记的文字、链接、模块顺序、可见性和有限布局选项，避免破坏鉴权、API、响应式行为与无障碍结构。

## 增加新模块

1. 在 `src/content/site-pages.json` 对应页面登记稳定的 `id`、`type`、字段和权限。
2. 在 React 页面或组件中通过 `pageDocument` / `pageModule` 读取配置，并用 `EditableModule` 包住模块根节点。
3. 需要换行展示的文字使用 `EditableText` 或 `splitDisplayText`。
4. 运行 `pnpm run pages:edit:check`、测试、lint 和 build。

服务端会按当前已发布结构校验草稿：不能增加未知字段、改变模块身份、隐藏核心功能、注入脚本链接或使用未登记的布局值。构建失败时，已发布配置会自动恢复，草稿仍可继续修改。

## 网站变更自动同步

`.github/workflows/visual-editor-sync.yml` 会在页面代码、页面配置或编辑器本身发生变化时自动执行 `pnpm run editor:sync` 和完整构建。新增页面必须登记到 `src/content/site-pages.json`；已存在的本机草稿会在下次打开编辑器时通过增量迁移自动获得新页面、新模块和新字段，同时保留原有文字与排序。检查失败时 PR 不应合并，避免网站已经变化而编辑器仍停留在旧目录。
