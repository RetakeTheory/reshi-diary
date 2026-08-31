"use client";
/* eslint-disable @next/next/no-img-element -- object URL previews are local and short-lived */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import { readJsonOrEmpty } from "../../lib/http-response";
import SurveyRichEditor from "./SurveyRichEditor";

type OneBotGroup = { groupId: string; displayName: string };
type OneBotAccount = {
  botId: string;
  displayName: string;
  enabled: boolean;
  online: boolean;
  createdAt: number;
  groups: OneBotGroup[];
};
type Config = {
  configured: boolean;
  online: boolean;
  bots: OneBotAccount[];
  reverseWsPath: string;
};
type TokenReveal = { botId: string; accessToken: string };

const EMPTY_CONFIG: Config = { configured: false, online: false, bots: [], reverseWsPath: "/api/onebot/ws" };
const REVERSE_WS_URL = "wss://rettheory.top/api/onebot/ws";

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const result = await readJsonOrEmpty<T & { error?: string }>(response);
  if (!response.ok) throw new Error(result.error || "OneBot 操作失败");
  return result;
}

export default function OneBotManager() {
  const [config, setConfig] = useState<Config>(EMPTY_CONFIG);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [newBotId, setNewBotId] = useState("3794729228");
  const [newBotName, setNewBotName] = useState("站内 QQ Bot");
  const [managedBotId, setManagedBotId] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [tokenReveal, setTokenReveal] = useState<TokenReveal | null>(null);
  const [mode, setMode] = useState<"card" | "image">("card");
  const [caption, setCaption] = useState("");
  const [cardTitle, setCardTitle] = useState("");
  const [cardContent, setCardContent] = useState("");
  const [cardUrl, setCardUrl] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const preview = useMemo(() => image ? URL.createObjectURL(image) : "", [image]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const loadConfig = useCallback(async () => {
    const result = await requestJson<Config>("/api/admin/onebot", { cache: "no-store" });
    setConfig(result);
    setSelectedBotId((current) => result.bots.some((bot) => bot.botId === current) ? current : result.bots[0]?.botId || "");
    setManagedBotId((current) => result.bots.some((bot) => bot.botId === current) ? current : result.bots[0]?.botId || "");
  }, []);

  useEffect(() => {
    requestJson<Config>("/api/admin/onebot", { cache: "no-store" })
      .then((result) => {
        setConfig(result);
        setSelectedBotId(result.bots[0]?.botId || "");
        setManagedBotId(result.bots[0]?.botId || "");
      })
      .catch((error) => {
        setIsError(true);
        setMessage(error instanceof Error ? error.message : "OneBot 状态读取失败");
      });
  }, []);

  const selectedBot = useMemo(
    () => config.bots.find((bot) => bot.botId === selectedBotId) || null,
    [config.bots, selectedBotId],
  );
  const managedBot = useMemo(
    () => config.bots.find((bot) => bot.botId === managedBotId) || null,
    [config.bots, managedBotId],
  );

  const effectiveGroupId = selectedBot?.groups.some((group) => group.groupId === groupId)
    ? groupId
    : selectedBot?.groups[0]?.groupId || "";

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function showMessage(value: string, error = false) {
    setMessage(value);
    setIsError(error);
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showMessage(`${label}已复制`);
    } catch {
      showMessage(`无法自动复制，请手动选择${label}`, true);
    }
  }

  async function createBot(event: FormEvent) {
    event.preventDefault();
    setBusy("create-bot"); showMessage("");
    try {
      const result = await requestJson<{ accessToken: string; bot: OneBotAccount }>("/api/admin/onebot/bots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botId: newBotId, displayName: newBotName }),
      });
      setTokenReveal({ botId: result.bot.botId, accessToken: result.accessToken });
      setSelectedBotId(result.bot.botId);
      setManagedBotId(result.bot.botId);
      setNewBotId(""); setNewBotName("");
      await loadConfig();
      showMessage(`Bot ${result.bot.botId} 已添加，请保存一次性连接令牌`);
    } catch (error) { showMessage(error instanceof Error ? error.message : "Bot 添加失败", true); }
    finally { setBusy(""); }
  }

  async function toggleBot(bot: OneBotAccount) {
    setBusy(`toggle-${bot.botId}`); showMessage("");
    try {
      await requestJson(`/api/admin/onebot/bots/${bot.botId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !bot.enabled }),
      });
      await loadConfig();
      showMessage(`${bot.displayName} 已${bot.enabled ? "停用" : "启用"}`);
    } catch (error) { showMessage(error instanceof Error ? error.message : "Bot 状态更新失败", true); }
    finally { setBusy(""); }
  }

  async function rotateToken(bot: OneBotAccount) {
    if (!window.confirm(`轮换 ${bot.displayName} 的连接令牌？当前连接会立即失效。`)) return;
    setBusy(`token-${bot.botId}`); showMessage("");
    try {
      const result = await requestJson<{ accessToken: string }>(`/api/admin/onebot/bots/${bot.botId}/token`, { method: "POST" });
      setTokenReveal({ botId: bot.botId, accessToken: result.accessToken });
      await loadConfig();
      showMessage("新令牌已生成，请立即更新 OneBot 客户端");
    } catch (error) { showMessage(error instanceof Error ? error.message : "令牌轮换失败", true); }
    finally { setBusy(""); }
  }

  async function deleteBot(bot: OneBotAccount) {
    if (!window.confirm(`删除 ${bot.displayName} 及其全部群配置？历史发送记录会保留。`)) return;
    setBusy(`delete-${bot.botId}`); showMessage("");
    try {
      await requestJson(`/api/admin/onebot/bots/${bot.botId}`, { method: "DELETE" });
      if (tokenReveal?.botId === bot.botId) setTokenReveal(null);
      await loadConfig();
      showMessage(`${bot.displayName} 已删除`);
    } catch (error) { showMessage(error instanceof Error ? error.message : "Bot 删除失败", true); }
    finally { setBusy(""); }
  }

  async function addGroup(event: FormEvent) {
    event.preventDefault();
    if (!managedBot) return;
    setBusy("add-group"); showMessage("");
    try {
      await requestJson(`/api/admin/onebot/bots/${managedBot.botId}/groups`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: newGroupId, displayName: newGroupName }),
      });
      setNewGroupId(""); setNewGroupName("");
      await loadConfig();
      showMessage(`群 ${newGroupId} 已加入 ${managedBot.displayName}`);
    } catch (error) { showMessage(error instanceof Error ? error.message : "群添加失败", true); }
    finally { setBusy(""); }
  }

  async function deleteGroup(bot: OneBotAccount, group: OneBotGroup) {
    if (!window.confirm(`从 ${bot.displayName} 移除群 ${group.displayName || group.groupId}？`)) return;
    setBusy(`group-${bot.botId}-${group.groupId}`); showMessage("");
    try {
      await requestJson(`/api/admin/onebot/bots/${bot.botId}/groups/${group.groupId}`, { method: "DELETE" });
      await loadConfig();
      showMessage(`群 ${group.groupId} 已移除`);
    } catch (error) { showMessage(error instanceof Error ? error.message : "群移除失败", true); }
    finally { setBusy(""); }
  }

  function chooseImage(file: File | null) {
    showMessage("");
    if (!file) { setImage(null); return; }
    if (!/^image\/(?:avif|gif|jpeg|png|webp)$/.test(file.type)) { showMessage("仅支持 AVIF、GIF、JPEG、PNG 或 WebP 图片", true); return; }
    if (file.size > 8 * 1024 * 1024) { showMessage("图片不能超过 8 MB", true); return; }
    setImage(file);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selectedBot) { showMessage("请先选择 Bot", true); return; }
    if (mode === "image" && !image) { showMessage("请先选择一张图片", true); return; }
    if (mode === "card" && (!cardTitle.trim() || !cardContent.replace(/<[^>]+>/g, " ").trim())) { showMessage("请填写卡片标题和正文", true); return; }
    setBusy("send"); showMessage("");
    try {
      const form = new FormData();
      form.append("mode", mode); form.append("botId", selectedBot.botId); form.append("groupId", effectiveGroupId);
      if (mode === "image") { form.append("caption", caption); form.append("image", image!); }
      else { form.append("title", cardTitle); form.append("contentHtml", cardContent); form.append("url", cardUrl); }
      const result = await requestJson<{ messageId?: string }>("/api/admin/onebot", { method: "POST", body: form });
      showMessage(`${mode === "card" ? "卡片" : "图片"}通知已发送${result.messageId ? ` · 消息 ${result.messageId}` : ""}`);
      if (mode === "image") { setCaption(""); setImage(null); }
      else { setCardTitle(""); setCardContent(""); setCardUrl(""); }
    } catch (error) { showMessage(error instanceof Error ? error.message : "QQ 通知发送失败", true); }
    finally { setBusy(""); }
  }

  return <section className="onebot-manager" aria-labelledby="onebot-title">
    <header>
      <div><h2 id="onebot-title">QQ Bot 与群通知</h2><span>多个 OneBot 11 客户端可同时反向连接；每个 Bot 只发送到自己已授权的群。</span></div>
      <div className={`onebot-connection ${config.online ? "is-online" : ""}`}><i aria-hidden="true" /><span>{config.bots.filter((bot) => bot.online).length} / {config.bots.length} 个 Bot 在线</span></div>
    </header>

    <section className="onebot-accounts" aria-labelledby="onebot-accounts-title">
      <div className="onebot-section-heading"><div><h3 id="onebot-accounts-title">Bot 账号</h3><p>新增后会生成独立连接令牌；明文只显示一次。</p></div></div>
      {config.bots.length ? <div className="onebot-account-list">{config.bots.map((bot) => <article className="onebot-account-row" key={bot.botId}>
        <div className={`onebot-account-status ${bot.online ? "is-online" : ""}`}><Icon name="bot" /><i aria-hidden="true" /></div>
        <div className="onebot-account-copy"><b>{bot.displayName}</b><span>QQ {bot.botId} · {bot.enabled ? bot.online ? "已连接" : "等待连接" : "已停用"}</span></div>
        <div className="onebot-account-groups"><span>{bot.groups.length} 个群</span>{bot.groups.slice(0, 3).map((group) => <small key={group.groupId}>{group.displayName || group.groupId}</small>)}</div>
        <div className="onebot-account-actions">
          <button type="button" onClick={() => toggleBot(bot)} disabled={Boolean(busy)}>{bot.enabled ? "停用" : "启用"}</button>
          <button type="button" onClick={() => rotateToken(bot)} disabled={Boolean(busy)}>轮换令牌</button>
          <button type="button" className="is-danger" aria-label={`删除 ${bot.displayName}`} onClick={() => deleteBot(bot)} disabled={Boolean(busy)}><Icon name="trash" /></button>
        </div>
      </article>)}</div> : <div className="onebot-empty"><Icon name="bot" /><div><b>还没有 Bot</b><p>添加第一个账号即可获得反向 WebSocket 连接令牌，之后可随时继续添加更多账号。</p></div></div>}
      <form className="onebot-inline-form" onSubmit={createBot}>
        <label><span>Bot QQ 号</span><input inputMode="numeric" value={newBotId} onChange={(event) => setNewBotId(event.target.value)} placeholder="3794729228" required /></label>
        <label><span>显示名称</span><input value={newBotName} maxLength={40} onChange={(event) => setNewBotName(event.target.value)} placeholder="例如：站内通知 Bot" /></label>
        <button type="submit" disabled={Boolean(busy) || !newBotId.trim()}><Icon name="plus" />{busy === "create-bot" ? "正在添加…" : "添加 Bot"}</button>
      </form>
    </section>

    {tokenReveal && <aside className="onebot-token-reveal" aria-labelledby="onebot-token-title">
      <Icon name="key" />
      <div><h3 id="onebot-token-title">保存 Bot {tokenReveal.botId} 的连接令牌</h3><p>OneBot 反向 WS 地址固定不变；将令牌配置为该客户端的 access token。关闭后无法再次查看，只能轮换。</p>
        <dl><div><dt>反向 WS</dt><dd><code>{REVERSE_WS_URL}</code><button type="button" onClick={() => copyValue(REVERSE_WS_URL, "地址")}><Icon name="copy" />复制</button></dd></div><div><dt>Access token</dt><dd><code>{tokenReveal.accessToken}</code><button type="button" onClick={() => copyValue(tokenReveal.accessToken, "令牌")}><Icon name="copy" />复制</button></dd></div></dl>
      </div>
      <button className="onebot-token-close" type="button" aria-label="关闭令牌提示" onClick={() => setTokenReveal(null)}><Icon name="close" /></button>
    </aside>}

    <section className="onebot-groups" aria-labelledby="onebot-groups-title">
      <div className="onebot-section-heading"><div><h3 id="onebot-groups-title">允许发送的群</h3><p>群白名单按 Bot 隔离，删除后立即禁止发送。</p></div>{config.bots.length > 0 && <select aria-label="选择要管理群的 Bot" value={managedBotId} onChange={(event) => setManagedBotId(event.target.value)}>{config.bots.map((bot) => <option key={bot.botId} value={bot.botId}>{bot.displayName} · {bot.botId}</option>)}</select>}</div>
      {managedBot ? <><div className="onebot-group-list">{managedBot.groups.length ? managedBot.groups.map((group) => <span key={group.groupId}><b>{group.displayName || `QQ群 ${group.groupId}`}</b><small>{group.groupId}</small><button type="button" aria-label={`移除群 ${group.groupId}`} onClick={() => deleteGroup(managedBot, group)} disabled={Boolean(busy)}><Icon name="close" /></button></span>) : <p>此 Bot 还没有允许发送的群。</p>}</div>
        <form className="onebot-inline-form" onSubmit={addGroup}><label><span>QQ群号</span><input inputMode="numeric" value={newGroupId} onChange={(event) => setNewGroupId(event.target.value)} placeholder="输入群号" required /></label><label><span>群名称（选填）</span><input value={newGroupName} maxLength={40} onChange={(event) => setNewGroupName(event.target.value)} placeholder="便于后台识别" /></label><button type="submit" disabled={Boolean(busy) || !newGroupId.trim()}><Icon name="plus" />{busy === "add-group" ? "正在添加…" : "添加群"}</button></form></> : <div className="onebot-empty"><Icon name="shield" /><div><b>先添加 Bot</b><p>创建 Bot 后即可为它配置一个或多个群。</p></div></div>}
    </section>

    <section className="onebot-compose" aria-labelledby="onebot-compose-title">
      <div className="onebot-section-heading"><div><h3 id="onebot-compose-title">发送群通知</h3><p>选择在线 Bot 和已授权群，发送富文本卡片或图片。</p></div></div>
      <form onSubmit={send}>
        <div className="onebot-target-fields"><label><span>使用 Bot</span><select value={selectedBotId} onChange={(event) => setSelectedBotId(event.target.value)}>{config.bots.map((bot) => <option value={bot.botId} key={bot.botId}>{bot.displayName} · {bot.online ? "在线" : "离线"}</option>)}</select></label><label><span>发送到群</span><select value={effectiveGroupId} onChange={(event) => setGroupId(event.target.value)}>{selectedBot?.groups.map((group) => <option value={group.groupId} key={group.groupId}>{group.displayName || `QQ群 ${group.groupId}`}</option>)}</select></label></div>
        {!selectedBot?.online || !selectedBot.groups.length ? <div className="onebot-compose-blocked"><Icon name="shield" /><span>{!config.bots.length ? "请先添加 Bot" : !selectedBot?.online ? "所选 Bot 尚未连接" : "请先为所选 Bot 添加允许群"}</span></div> : null}
        <div className="onebot-mode-switch" role="tablist" aria-label="通知形式"><button type="button" role="tab" aria-selected={mode === "card"} className={mode === "card" ? "is-active" : ""} onClick={() => setMode("card")}><Icon name="link" />富文本卡片</button><button type="button" role="tab" aria-selected={mode === "image"} className={mode === "image" ? "is-active" : ""} onClick={() => setMode("image")}><Icon name="image" />图片通知</button></div>
        <div className="onebot-fields">{mode === "card" ? <label><span>卡片标题</span><input value={cardTitle} maxLength={100} onChange={(event) => setCardTitle(event.target.value)} placeholder="群内卡片的标题" required /></label> : <label><span>附带文字（选填）</span><textarea value={caption} maxLength={500} onChange={(event) => setCaption(event.target.value)} placeholder="图片前要发送的说明文字" /></label>}</div>
        {mode === "card" ? <div className="onebot-card-editor"><SurveyRichEditor compact label="卡片正文" description="发送时会清理 HTML、提取摘要，并把首张图片作为卡片封面。" placeholder="编辑要发送到 QQ 群的通知……" value={cardContent} onChange={setCardContent} /><label><span>点击卡片后打开（选填）</span><input value={cardUrl} maxLength={500} onChange={(event) => setCardUrl(event.target.value)} placeholder="站内路径 /posts/... 或 HTTPS 地址；留空打开首页" /></label></div> : <label className={`onebot-image-picker ${preview ? "has-image" : ""}`}><input type="file" accept="image/avif,image/gif,image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0] || null)} /><span className="onebot-image-icon"><Icon name="image" /></span>{preview ? <img src={preview} alt="待发送图片预览" /> : <span><b>选择通知图片</b><small>AVIF、GIF、JPEG、PNG、WebP · 最大 8 MB</small></span>}</label>}
        <footer><span><Icon name="bot" /> {selectedBot ? `经 ${selectedBot.displayName} 的当前连接发送` : "等待选择 Bot"}</span><button type="submit" disabled={Boolean(busy) || !selectedBot?.online || !effectiveGroupId || (mode === "image" ? !image : !cardTitle.trim() || !cardContent.trim())}>{busy === "send" ? "正在发送…" : `发送${mode === "card" ? "卡片" : "图片"}通知`}</button></footer>
      </form>
    </section>
    {message && <p className={`onebot-message ${isError ? "is-error" : ""}`} role="status">{message}</p>}
  </section>;
}
