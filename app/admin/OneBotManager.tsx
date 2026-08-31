"use client";
/* eslint-disable @next/next/no-img-element -- object URL previews are local and short-lived */

import { FormEvent, useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import { readJsonOrEmpty } from "../../lib/http-response";

type Config = { configured: boolean; online?: boolean; botId: string | null; groupIds: string[]; reverseWsPath?: string };

export default function OneBotManager() {
  const [config, setConfig] = useState<Config>({ configured: false, online: false, botId: null, groupIds: [] });
  const [groupId, setGroupId] = useState("");
  const [caption, setCaption] = useState("");
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
    if (!image) { setMessage("请先选择一张图片"); return; }
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.append("groupId", groupId); form.append("caption", caption); form.append("image", image);
      const response = await fetch("/api/admin/onebot", { method: "POST", body: form });
      const result = await readJsonOrEmpty<{ messageId?: string; error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "图片通知发送失败");
      setMessage(`图片通知已发送${result.messageId ? ` · 消息 ${result.messageId}` : ""}`); setCaption(""); setImage(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "图片通知发送失败"); }
    finally { setBusy(false); }
  }

  return <section className="onebot-manager" aria-labelledby="onebot-title">
    <header><div><p>ONEBOT 11 / QQ 群通知</p><h2 id="onebot-title">通过指定 Bot 发送图片</h2><span>Bot 以反向 WebSocket 主动连接网站；发送目标仅限服务端群白名单。</span></div><div className={`onebot-connection ${config.online ? "is-online" : ""}`}><i aria-hidden="true" /><span>{!config.configured ? "未配置" : config.online ? `Bot ${config.botId} 在线` : `Bot ${config.botId} 离线`}</span></div></header>
    {!config.configured ? <div className="onebot-empty"><Icon name="shield" /><div><b>先配置 Rust 后端环境变量</b><p>需要 ONEBOT_ACCESS_TOKEN、ONEBOT_BOT_ID、ONEBOT_ALLOWED_GROUP_IDS；Bot 反向 WS 地址为 <code>wss://rettheory.top/api/onebot/ws</code>。</p></div></div> : <form onSubmit={send}>
      <div className="onebot-fields"><label><span>发送到群</span><select value={groupId} onChange={(event) => setGroupId(event.target.value)}>{config.groupIds.map((id) => <option value={id} key={id}>QQ群 {id}</option>)}</select></label><label><span>附带文字（选填）</span><textarea value={caption} maxLength={500} onChange={(event) => setCaption(event.target.value)} placeholder="图片前要发送的说明文字" /></label></div>
      <label className={`onebot-image-picker ${preview ? "has-image" : ""}`}><input type="file" accept="image/avif,image/gif,image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0] || null)} /><span className="onebot-image-icon"><Icon name="image" /></span>{preview ? <img src={preview} alt="待发送图片预览" /> : <span><b>选择通知图片</b><small>AVIF、GIF、JPEG、PNG、WebP · 最大 8 MB</small></span>}</label>
      {message && <p className="onebot-message" role="status">{message}</p>}
      <footer><span><Icon name="bot" /> 所有动作经 Bot {config.botId} 的当前 WS 连接发送</span><button type="submit" disabled={busy || !config.online || !image}>{busy ? "正在发送…" : "发送图片通知"}</button></footer>
    </form>}
  </section>;
}
