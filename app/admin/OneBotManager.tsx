"use client";
/* eslint-disable @next/next/no-img-element -- object URL previews are local and short-lived */

import { FormEvent, useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import { readJsonOrEmpty } from "../../lib/http-response";
import SurveyRichEditor from "./SurveyRichEditor";

type Config = { configured: boolean; online?: boolean; botId: string | null; groupIds: string[]; reverseWsPath?: string };

export default function OneBotManager() {
  const [config, setConfig] = useState<Config>({ configured: false, online: false, botId: null, groupIds: [] });
  const [mode, setMode] = useState<"card" | "image">("card");
  const [groupId, setGroupId] = useState("");
  const [caption, setCaption] = useState("");
  const [cardTitle, setCardTitle] = useState("");
  const [cardContent, setCardContent] = useState("");
  const [cardUrl, setCardUrl] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const preview = useMemo(() => image ? URL.createObjectURL(image) : "", [image]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/onebot", { cache: "no-store" }).then(async (response) => {
      const result = await readJsonOrEmpty<Config & { error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "OneBot 状态读取失败");
      setConfig(result); setGroupId(result.groupIds[0] || "");
    }).catch((error) => setMessage(error instanceof Error ? error.message : "OneBot 状态读取失败"));
  }, []);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function chooseImage(file: File | null) {
    setMessage("");
    if (!file) { setImage(null); return; }
    if (!/^image\/(?:avif|gif|jpeg|png|webp)$/.test(file.type)) { setMessage("仅支持 AVIF、GIF、JPEG、PNG 或 WebP 图片"); return; }
    if (file.size > 8 * 1024 * 1024) { setMessage("图片不能超过 8 MB"); return; }
    setImage(file);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (mode === "image" && !image) { setMessage("请先选择一张图片"); return; }
    if (mode === "card" && (!cardTitle.trim() || !cardContent.replace(/<[^>]+>/g, " ").trim())) { setMessage("请填写卡片标题和正文"); return; }
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.append("mode", mode); form.append("groupId", groupId);
      if (mode === "image") { form.append("caption", caption); form.append("image", image!); }
      else { form.append("title", cardTitle); form.append("contentHtml", cardContent); form.append("url", cardUrl); }
      const response = await fetch("/api/admin/onebot", { method: "POST", body: form });
      const result = await readJsonOrEmpty<{ messageId?: string; error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "QQ 通知发送失败");
      setMessage(`${mode === "card" ? "卡片" : "图片"}通知已发送${result.messageId ? ` · 消息 ${result.messageId}` : ""}`);
      if (mode === "image") { setCaption(""); setImage(null); }
      else { setCardTitle(""); setCardContent(""); setCardUrl(""); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "QQ 通知发送失败"); }
    finally { setBusy(false); }
  }

  return <section className="onebot-manager" aria-labelledby="onebot-title">
    <header><div><p>ONEBOT 11 / QQ 群通知</p><h2 id="onebot-title">通过指定 Bot 发送卡片或图片</h2><span>Bot 以反向 WebSocket 主动连接网站；发送目标仅限服务端群白名单。</span></div><div className={`onebot-connection ${config.online ? "is-online" : ""}`}><i aria-hidden="true" /><span>{!config.configured ? "未配置" : config.online ? `Bot ${config.botId} 在线` : `Bot ${config.botId} 离线`}</span></div></header>
    {!config.configured ? <div className="onebot-empty"><Icon name="shield" /><div><b>先配置 Rust 后端环境变量</b><p>需要 ONEBOT_ACCESS_TOKEN、ONEBOT_BOT_ID、ONEBOT_ALLOWED_GROUP_IDS；Bot 反向 WS 地址为 <code>wss://rettheory.top/api/onebot/ws</code>。</p></div></div> : <form onSubmit={send}>
      <div className="onebot-mode-switch" role="tablist" aria-label="通知形式"><button type="button" role="tab" aria-selected={mode === "card"} className={mode === "card" ? "is-active" : ""} onClick={() => setMode("card")}><Icon name="link" />富文本卡片</button><button type="button" role="tab" aria-selected={mode === "image"} className={mode === "image" ? "is-active" : ""} onClick={() => setMode("image")}><Icon name="image" />图片通知</button></div>
      <div className="onebot-fields"><label><span>发送到群</span><select value={groupId} onChange={(event) => setGroupId(event.target.value)}>{config.groupIds.map((id) => <option value={id} key={id}>QQ群 {id}</option>)}</select></label>{mode === "card" ? <label><span>卡片标题</span><input value={cardTitle} maxLength={100} onChange={(event) => setCardTitle(event.target.value)} placeholder="群内卡片的标题" required /></label> : <label><span>附带文字（选填）</span><textarea value={caption} maxLength={500} onChange={(event) => setCaption(event.target.value)} placeholder="图片前要发送的说明文字" /></label>}</div>
      {mode === "card" ? <div className="onebot-card-editor"><SurveyRichEditor compact label="卡片正文" description="复用文章编辑器；发送时会清理 HTML、提取摘要，并把首张图片作为卡片封面。" placeholder="编辑要发送到 QQ 群的通知……" value={cardContent} onChange={setCardContent} /><label><span>点击卡片后打开（选填）</span><input value={cardUrl} maxLength={500} onChange={(event) => setCardUrl(event.target.value)} placeholder="站内路径 /posts/... 或 HTTPS 地址；留空打开首页" /></label></div> : <label className={`onebot-image-picker ${preview ? "has-image" : ""}`}><input type="file" accept="image/avif,image/gif,image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0] || null)} /><span className="onebot-image-icon"><Icon name="image" /></span>{preview ? <img src={preview} alt="待发送图片预览" /> : <span><b>选择通知图片</b><small>AVIF、GIF、JPEG、PNG、WebP · 最大 8 MB</small></span>}</label>}
      {message && <p className="onebot-message" role="status">{message}</p>}
      <footer><span><Icon name="bot" /> 所有动作经 Bot {config.botId} 的当前 WS 连接发送</span><button type="submit" disabled={busy || !config.online || !groupId || (mode === "image" ? !image : !cardTitle.trim() || !cardContent.trim())}>{busy ? "正在发送…" : `发送${mode === "card" ? "卡片" : "图片"}通知`}</button></footer>
    </form>}
  </section>;
}
