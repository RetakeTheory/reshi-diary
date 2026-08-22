# reshi Figma 文字同步插件

这个开发插件只读取当前 Figma 页面中名称与 `figma-text-map.json` 完全匹配的 `TEXT` 图层，并把 `characters` 文字提交给本地服务。它不会读取或同步坐标、尺寸、字体、颜色、布局、Auto Layout、图片或组件结构。

## 使用

1. 在项目根目录运行 `npm run figma:sync`。
2. 在 Figma 桌面端打开“插件 → 开发 → 从 manifest 导入插件”，选择本目录的 `manifest.json`。
3. 将可编辑 Text 图层命名为：
   - `EDIT/home.hero.title`
   - `EDIT/home.hero.subtitle`
   - `EDIT/home.hero.cta`
4. 双击 Text 图层修改文字，运行“reshi 文字同步”，确认预览后点击“同步到网站”。

服务会校验白名单、更新 `src/content/home.json`、运行 `npm run build`，构建成功后只提交该内容文件并推送当前 Git 分支。若内容文件已有未提交修改，服务会拒绝覆盖。
