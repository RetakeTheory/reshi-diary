# 东华大学课程预约

任何人都可以在 `https://rettheory.top/appoint` 使用，无需登录本站。手机上打开“学校登录窗口”，在嵌入的学校页面完成通行证登录及学校企业微信验证，进入目标课程类别的课程列表后点“保存登录状态”。随后填写课程编号、选课序号、开始报名时间，并明确选择是否要教材；核对弹窗后才创建预约。

学校密码和企业微信验证码只在学校页面输入。每位访问者通过本站设置的独立、安全、HttpOnly Cookie 对应自己的 Durable Object，学校浏览器的 cookie/storageState 只存在对应实例中，不写入 GitHub、R2 或 S3。Cookie 有效期 60 天；清除本站 Cookie 或换设备后将无法查看或取消原设备上的预约。GitHub 国内镜像只能加速源码文件下载，不能执行预约；实际执行由 Cloudflare Worker、Browser Run 和 Durable Object alarm 完成。

预约前五分钟检查学校登录，过期时显示“需重新登录”，不会绕过学校认证。到点前约十五秒准备课程与班次，按网页原有确认控件提交。若名额已满，以一分钟间隔重试，最多监听十分钟。只有学校响应或弹窗明确包含成功结果才标记“报名成功”；结果无法确认时显示“已提交待核实”，应在学校选课结果中核对。

当前对接依据的是 2026 年 9 月的 `toSCC` 页面结构：`#enrollCoursesTbl`、`#accessClassTbl`、`input[name="buyMaterial"]` 和 `selectSubmit` 确认控件。学校可能修改页面、识别或限制后端浏览器自动化，Cloudflare 也可能延迟 alarm；没有在正式开放报名时执行真实报名验证，因此不保证抢到名额，也不能保证秒级准时。登录后需打开与目标课程相同的课程类别列表；不同类别应分别更新所保存的列表页。Cloudflare Workers Free 的 Browser Run 额度为每天 10 分钟；若账户仍是免费计划，登录窗口和多次重试可能耗尽额度。

部署需要 `wrangler.jsonc` 中的 Browser Run 绑定与 `DhuCourseSession` SQLite Durable Object migration。`scripts/protect-worker-bindings.mjs` 会阻止丢失绑定的发布。公开 API `/api/appoint` 将每位访问者路由到独立 Durable Object，写操作要求同源请求及访问者 Cookie。匿名入口无法阻止恶意访问者消耗共享 Browser Run 额度，公开多人使用前应检查 Cloudflare 配额和防滥用策略。
