# 东华大学课程预约对接

入口是 `https://rettheory.top/appoint`，无需登录本站。每位访问者的 `__Host-appoint` HttpOnly Cookie 指向自己的 `DhuCourseSession` Durable Object。本站后端直接请求学校的 `https://webproxy.dhu.edu.cn`，没有 Browser Run、额外代理或学校网页脚本注入。

登录流程依据学校 2026 年 9 月网页代码：从 `/login` 跳转动态获取学校身份认证路径，读取 `/esc-sso/authn/policy?app=webproxy443` 的公钥，用学校采用的 RSA PKCS#1 v1.5 加密通行证密码并向 `/esc-sso/authn/login` 提交。企业微信验证码由学校 `/esc-sso/message/code` 发送；本站只将用户输入的验证码连同学校返回的认证上下文提交到学校二次认证接口。密码、验证码不保存，只有学校会话 Cookie 保存在访问者自己的 Durable Object 中。网站必须经 HTTPS 访问，所有写操作要求本站同源请求。

`toSH` 是计算机类选课对照表，课程表 ID 为 `tsCoursesTbl`。点击课程编号后，学校脚本加载班次列表 `accessClassTbl`；点击选课序号后显示教材勾选框 `buyMaterial` 与最终“确认”控件。学校中间的 webproxy 路径由登录跳转和用户提供的完整课程页地址动态确定，不硬编码。课程申请参数为课程编号、选课序号、教材选择；预约时间精确输入到秒。

**当前状态：登录和课程页连接已经编写，未经真实学校账号完成端到端验证。自动报名暂未开放。** 学校的 `selecthome.js` 需在有效学校会话下获取，以确认 `selectSubmit` 的请求地址、参数和成功响应；无这些证据不得将预约标为成功。课程页连接时仅把获取到的学校静态脚本写入 Worker 诊断日志，不记录 HTML、账号、密码、验证码或 Cookie。核验完成后应删除该诊断日志并实现定时提交，再开放预约。

学校认证与会话会过期；系统应在过期时要求重新验证，不能绕过学校身份认证。Durable Object alarm 与网络延迟不保证请求精确到达学校的指定秒，实际结果只以学校返回的确认信息为准。
