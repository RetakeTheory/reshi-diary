// @ts-nocheck
// Recovered from the owner's Cloudflare Worker version 345 after the source was overwritten.
import { a as qn, c as Jn, i as Yn, n as Xn, o as Zn, r as Qn, t as er } from "./chaoxing-recovered.ts";
var Rg = 17,
  zg = `已暂停：视频末尾上报未通过`,
  Bg = 5e3,
  Vg = 1e3,
  Hg = (e) => `${e.knowledgeId}:${e.jobId}:${e.objectId}`,
  Ug = (e, t) => `cx:video-queue:${e}:${t}:`,
  Wg = (e, t, n) => Ug(e, t) + String(n).padStart(6, `0`);
function Gg(e, t = 0, n = []) {
  ((e.chapterIds = void 0),
    (e.chapterIndex = 0),
    (e.cardIndex = 0),
    (e.current = void 0),
    (e.cardJobs = void 0),
    (e.jobIndex = 0),
    (e.parsedCards = 0),
    (e.detectedVideos = 0),
    (e.passedVideos = 0),
    (e.completed = t),
    (e.completedJobIds = n),
    (e.discoveredJobIds = []),
    (e.scanComplete = !1),
    (e.queueId = crypto.randomUUID().replace(/-/g, ``)),
    (e.queuedVideos = 0),
    (e.queueIndex = 0),
    (e.rescanAfterCurrent = !1),
    (e.nextVideoAt = void 0),
    (e.currentQueueIndex = void 0),
    (e.finalAttempts = 0));
}
function Kg(e, t) {
  let n = e.current;
  (Gg(e, e.completed, e.completedJobIds || []),
    (e.current = n),
    (e.nextVideoAt = n ? Math.max(t, n.lastTickAt + 6e4) : void 0),
    (e.status = n
      ? `当前视频继续学习，同时从头扫描后续视频节点`
      : `正在从头核对全部视频节点`));
}
var qg = [
    `QQ Bot 菜单`,
    `10分钟后提醒我 喝水`,
    `明天 08:00 提醒我 二维码签到`,
    `二维码提醒送达后 30 分钟内私聊发原图`,
    `/register 手机号 密码`,
    `登录并开启监听（仅私聊）`,
    `/list 查看课程名称和课程序号`,
    `/pass+课程序号 后台挂载该课程视频任务`,
    `/location 纬度 经度 地址`,
    `设置定位签到的位置`,
    `/status 查看监听与挂课状态`,
    `/stop 暂停  /start 继续`,
    `/unregister 删除登录资料`,
    `普通、已设位置签到自动提交`,
    `视频按真实经过时间逐步上报并处理内嵌互动题`,
    `拍照、手势和签到码仍发送提醒`,
    `注册消息发出后请立即撤回`,
  ].join(`
`),
  Jg = class {
    constructor(
      e,
      t,
      n = (e, t) => new er(e?.cookies, t ? Zn(fetch, t) : fetch),
      r = () => null,
    ) {
      ((this.locks = new Map()),
        (this.storage = e),
        (this.send = t),
        (this.client = n),
        (this.decodeQr = r));
    }
    async openQrWindow(e, t, n) {
      if (!/^\d{5,20}$/.test(e) || !Number.isFinite(n) || n <= Date.now())
        return;
      let r = `cx:qr-window:` + e,
        i = await this.storage.get(r);
      (!i || i.expiresAt < n) &&
        (await this.storage.put(r, { reminderId: t, expiresAt: n }));
    }
    async hasQrWindow(e) {
      return !!(await this.storage.get(`cx:qr-window:` + e));
    }
    async qrImage(e, t, n = Date.now()) {
      let r = `cx:qr-window:` + e;
      return (await this.storage.get(r))
        ? (await this.serial(e, async () => {
            let i = await this.storage.get(r);
            if (!i) return;
            if (i.expiresAt <= n) {
              (await this.storage.delete(r),
                await this.send(
                  e,
                  `二维码自动签到窗口已过期，请重新设置二维码提醒。`,
                ));
              return;
            }
            let a = `cx:account:` + e,
              o = await this.storage.get(a);
            if (!o) {
              await this.send(
                e,
                `尚未绑定学习通，请先私聊 /register 手机号 密码。`,
              );
              return;
            }
            let s;
            try {
              s = this.decodeQr(t);
            } catch (t) {
              await this.send(
                e,
                t instanceof Error ? t.message : `二维码图片解析失败`,
              );
              return;
            }
            if (!s) {
              await this.send(
                e,
                `没有识别到学习通签到二维码，请将二维码拍清晰后重试。`,
              );
              return;
            }
            try {
              let t = this.client(o.session),
                i = Object.values(o.qrActivities || {}),
                c = s.activeId ? i.find((e) => e.id === s.activeId) : i.at(-1);
              if (
                (!c &&
                  s.activeId &&
                  s.courseId &&
                  s.classId &&
                  (c = {
                    id: s.activeId,
                    courseId: s.courseId,
                    classId: s.classId,
                    name: `二维码签到`,
                    otherId: 2,
                  }),
                !c)
              )
                for (let e of o.session.courses.slice(0, 20)) {
                  let n = await t.activities(e);
                  if (
                    ((c = s.activeId
                      ? n.find((e) => e.id === s.activeId && e.otherId === 2)
                      : n.find((e) => e.otherId === 2)),
                    c)
                  )
                    break;
                }
              if (!c) {
                await this.send(
                  e,
                  `未找到对应的进行中二维码签到，30 分钟窗口内可继续发送新照片。`,
                );
                return;
              }
              let l = await t.signQr(c, s.enc);
              ((o.session.cookies = t.cookies),
                (o.qrActivities = { ...(o.qrActivities || {}), [c.id]: c }),
                (l === `签到成功` || l === `已签到`) &&
                  ((o.receipts[c.id] = l), await this.storage.delete(r)),
                this.rememberSign(o, c, l, n),
                (o.lastStatus = `${c.name}：${l}`),
                await this.storage.put(a, o),
                await this.send(e, `${c.name}\n${l}`, !0));
            } catch (t) {
              await this.send(
                e,
                t instanceof Xn
                  ? t.message
                  : `二维码签到处理失败，请在 30 分钟窗口内重试。`,
              );
            }
          }),
          !0)
        : !1;
    }
    async serial(e, t) {
      let n = (this.locks.get(e) || Promise.resolve()).catch(() => {}).then(t);
      this.locks.set(e, n);
      try {
        return await n;
      } finally {
        this.locks.get(e) === n && this.locks.delete(e);
      }
    }
    rememberSign(e, t, n, r) {
      let i = e.session.courses.find(
        (e) => e.courseId === t.courseId && e.classId === t.classId,
      );
      e.signHistory = [
        {
          activityId: t.id,
          courseName: i?.name || `课程`,
          activityName: t.name || `签到活动`,
          result: n,
          checkedAt: r,
        },
        ...(e.signHistory || []).filter((e) => e.activityId !== t.id),
      ].slice(0, 100);
    }
    async queryByUid(e) {
      if (!/^\d{1,24}$/.test(e)) return null;
      let t = [
        ...(
          await this.storage.list({ prefix: `cx:account:`, limit: 200 })
        ).values(),
      ].find((t) => t.session.cookies._uid === e);
      if (!t) return null;
      let n = t.video,
        r = n ? (n.passedVideos || 0) + n.completed : 0,
        i = [...(t.signHistory || [])],
        a = new Set(i.map((e) => e.activityId));
      for (let [e, n] of Object.entries(t.receipts).reverse()) {
        if (a.has(e)) continue;
        let r = t.qrActivities?.[e];
        i.push({
          activityId: e,
          courseName: `课程`,
          activityName: r?.name || `历史签到`,
          result: n,
          checkedAt: 0,
        });
      }
      return {
        enabled: t.enabled,
        courseCount: t.session.courses.length,
        locationConfigured: !!t.location,
        lastStatus: t.lastStatus,
        updatedAt: Math.max(
          t.repairRequestedAt || 0,
          t.lastActivityAt || 0,
          n?.current?.lastTickAt || 0,
          t.refreshedAt || 0,
        ),
        mount: n
          ? {
              courseName: n.course.name || `所选课程`,
              status: n.status,
              total: n.detectedVideos || 0,
              completed: r,
              scanning:
                (n.protocolVersion || 0) >= Rg
                  ? !n.scanComplete
                  : !!(n.chapterIds && n.chapterIndex < n.chapterIds.length),
              current: n.current
                ? {
                    name: n.current.name,
                    playingTime: n.current.playingTime,
                    duration: n.current.duration,
                  }
                : null,
            }
          : null,
        signIns: i.sort((e, t) => t.checkedAt - e.checkedAt).slice(0, 50),
      };
    }
    async repairByUid(e, t = Date.now()) {
      if (!/^\d{1,24}$/.test(e))
        return { ok: !1, message: `账号标识无效`, snapshot: null };
      let n = [
        ...(await this.storage.list({ prefix: `cx:account:`, limit: 200 })),
      ].find(([, t]) => t.session.cookies._uid === e);
      if (!n)
        return { ok: !1, message: `未找到当前账号的挂载记录`, snapshot: null };
      let [r] = n,
        i = r.slice(11);
      return {
        ...(await this.serial(i, async () => {
          let n = await this.storage.get(r);
          return !n || n.session.cookies._uid !== e
            ? { ok: !1, message: `当前账号记录已变化，请重新登录` }
            : n.video
              ? n.enabled
                ? n.repairRequestedAt && t - n.repairRequestedAt < 15e3
                  ? { ok: !1, message: `修复请求已提交，请等待十几秒后刷新` }
                  : ((n.failures = 0),
                    (n.nextAt = t),
                    (n.repairRequestedAt = t),
                    (n.lastStatus = `已提交自助修复：保留当前视频进度和任务队列，等待立即重试`),
                    (n.video.finalAttempts = 0),
                    await this.storage.put(r, n),
                    {
                      ok: !0,
                      message: `修复请求已提交，当前进度和任务队列均已保留`,
                    })
                : {
                    ok: !1,
                    message: `当前挂载已暂停，请先在 QQ Bot 中发送 /start，再使用自助修复`,
                  }
              : { ok: !1, message: `当前没有需要修复的挂载任务` };
        })),
        snapshot: await this.queryByUid(e),
      };
    }
    videoStatus(e) {
      let t = e.video,
        n =
          (e.enabled ? `监听中` : `已暂停`) +
          `
课程数：` +
          e.session.courses.length +
          `
位置：` +
          (e.location ? `已设置` : `未设置`) +
          `
挂课：` +
          (t?.status || `未挂载`) +
          `
` +
          e.lastStatus;
      if (!t) return { text: n, progress: [] };
      let r = (t.passedVideos || 0) + t.completed,
        i = t.detectedVideos || 0,
        a =
          (t.protocolVersion || 0) >= Rg
            ? !t.scanComplete
            : !!(t.chapterIds && t.chapterIndex < t.chapterIds.length),
        o = [];
      return (
        t.current &&
          o.push({
            label: `当前视频`,
            value: t.current.duration
              ? (t.current.playingTime / t.current.duration) * 100
              : 0,
            text: `${t.current.playingTime}/${t.current.duration} 秒`,
          }),
        o.push({
          label: a ? `任务点总进度（扫描中）` : `任务点总进度`,
          value: i ? (r / i) * 100 : 0,
          text: `${r}/${i} 个`,
        }),
        { text: n, progress: o }
      );
    }
    async clearVideoQueue(e, t) {
      if (!t.queueId) return;
      let n = await this.storage.list({ prefix: Ug(e, t.queueId), limit: Vg });
      await Promise.all([...n.keys()].map((e) => this.storage.delete(e)));
    }
    async completeVideoMount(e, t, n) {
      (t.video && (await this.clearVideoQueue(e, t.video)),
        (t.video = void 0),
        t.outbox.push(n),
        (t.lastStatus = n));
    }
    async startNextQueuedVideo(e, t, n, r) {
      let i = t.video;
      if (!i || i.current || !i.queueId) return !1;
      for (
        let a = 0;
        a < 3 && (i.queueIndex || 0) < (i.queuedVideos || 0);
        a++
      ) {
        let a = await this.storage.get(Wg(e, i.queueId, i.queueIndex || 0));
        if (!a)
          throw (
            await this.clearVideoQueue(e, i),
            Gg(i),
            (i.status = `视频挂载队列不完整，正在重新扫描全部节点`),
            new Xn(`视频挂载队列不完整，已保留挂载并重新扫描`)
          );
        let o = await n.videoProgress(a, r);
        if (o.isPassed) {
          ((i.completedJobIds || []).includes(Hg(o)) ||
            (i.passedVideos = (i.passedVideos || 0) + 1),
            (i.queueIndex = (i.queueIndex || 0) + 1),
            (i.status = `已跳过完成视频：${o.name}`));
          continue;
        }
        return (
          (i.current = o),
          (i.currentQueueIndex = i.queueIndex || 0),
          (i.nextVideoAt = r + 6e4),
          (i.finalAttempts = 0),
          (i.status = `开始学习：${i.current.name}，${i.current.playingTime}/${i.current.duration} 秒`),
          t.outbox.push(i.status),
          !0
        );
      }
      return !1;
    }
    async advanceVideo(e, t, n, r) {
      let i = t.video;
      if (i) {
        if (i.current && r >= (i.nextVideoAt || i.current.lastTickAt + 6e4)) {
          let a = Math.max(
              0,
              Math.min(90, Math.floor((r - i.current.lastTickAt) / 1e3)),
            ),
            o = Math.min(i.current.duration, i.current.playingTime + a),
            s = i.current.interactionMid
              ? await n.videoInteractions(i.current, i.current.playingTime)
              : [],
            c = new Map(
              (i.current.interactions || []).map((e) => [e.resourceId, e]),
            );
          for (let e of s) c.set(e.resourceId, e);
          if (o >= i.current.duration && i.current.interactionMid) {
            for (let e of await n.videoInteractions(i.current, 0))
              c.set(e.resourceId, e);
            for (let e of await n.videoInteractions(i.current))
              c.set(e.resourceId, e);
          }
          i.current.interactions = [...c.values()]
            .sort((e, t) => e.startTime - t.startTime)
            .slice(0, 100);
          let l = new Set(i.current.answeredInteractions || []),
            u = (i.current.interactions || []).filter(
              (e) => e.startTime <= o && !l.has(e.resourceId),
            );
          for (let e of u)
            (await n.answerVideoInteraction(e), l.add(e.resourceId));
          u.length && (i.current.answeredInteractions = [...l].slice(-100));
          let d = o >= i.current.duration,
            f = await n.reportVideo(i.course, i.current, o, d);
          if (
            ((i.current = { ...i.current, playingTime: o, lastTickAt: r }),
            (i.nextVideoAt = r + 6e4),
            (i.status = `正在学习：${i.current.name} ${o}/${i.current.duration} 秒${u.length ? `，已通过 ${u.length} 道互动题` : ``}`),
            f)
          ) {
            i.completed++;
            let t = Hg(i.current);
            ((i.completedJobIds = [
              ...new Set([...(i.completedJobIds || []), t]),
            ].slice(-Vg)),
              (i.status = `已完成 ${i.current.name}，继续查找下一任务点`),
              (i.current = void 0),
              (i.nextVideoAt = void 0),
              (i.finalAttempts = 0));
            let n = i.currentQueueIndex;
            ((i.currentQueueIndex = void 0),
              i.rescanAfterCurrent
                ? (await this.clearVideoQueue(e, i),
                  Gg(i, 1, [t]),
                  (i.status = `当前视频已完成，开始扫描全部节点并核对完成状态`))
                : n !== void 0 &&
                  n === (i.queueIndex || 0) &&
                  (i.queueIndex = (i.queueIndex || 0) + 1));
          } else if (d && ++i.finalAttempts >= 3)
            throw (
              (t.enabled = !1),
              (i.status = zg),
              new Xn(
                `视频已播至末尾但任务点未通过，已暂停挂课，请在学习通检查验证码或任务限制`,
              )
            );
        }
        if (
          (!i.current &&
            (i.queueIndex || 0) < (i.queuedVideos || 0) &&
            (await this.startNextQueuedVideo(e, t, n, r)),
          !i.chapterIds?.length && !i.scanComplete)
        ) {
          let e = await n.chapters(i.course);
          if (((i.chapterIndex = 0), (i.cardIndex = 0), !e.length))
            throw new Xn(`该课程没有可读取的章节`);
          ((i.chapterIds = e),
            (i.queueId ||= crypto.randomUUID().replace(/-/g, ``)),
            (i.queuedVideos ||= 0),
            (i.queueIndex ||= 0),
            (i.scanComplete = !1));
        }
        if (!i.scanComplete && i.chapterIds) {
          let a = 0;
          for (; a < 3 || i.chapterIndex >= i.chapterIds.length; ) {
            if (i.chapterIndex >= i.chapterIds.length) {
              if (!i.parsedCards)
                throw (
                  await this.clearVideoQueue(e, i),
                  Gg(i),
                  (i.status = `任务点页面未能解析，等待重新读取`),
                  new Xn(
                    `读取到了章节，但任务点页面未能解析；已保留挂载并将在稍后重试`,
                  )
                );
              if (((i.scanComplete = !0), !i.detectedVideos)) {
                await this.completeVideoMount(
                  e,
                  t,
                  `${i.course.name || `所选课程`}扫描完毕，但没有识别到视频任务点；章节检测等非视频任务未处理。`,
                );
                return;
              }
              if (!i.queuedVideos && !i.current) {
                await this.completeVideoMount(
                  e,
                  t,
                  `${i.course.name || `所选课程`}已扫描全部节点，共 ${i.detectedVideos} 个视频任务点，均已完成，无需挂载。`,
                );
                return;
              }
              i.status = i.current
                ? `正在学习：${i.current.name}；全部节点扫描完成，共 ${i.detectedVideos} 个视频`
                : `全部节点扫描完成：视频 ${i.detectedVideos} 个，已完成 ${(i.passedVideos || 0) + i.completed} 个，待挂载 ${Math.max(0, (i.queuedVideos || 0) - (i.queueIndex || 0))} 个`;
              break;
            }
            if (i.cardIndex >= 100)
              throw new Xn(`章节卡片数量异常，已停止扫描以避免无限请求`);
            let o = i.chapterIds[i.chapterIndex],
              s = await n.videoJobs(i.course, o, i.cardIndex);
            if ((a++, s === null)) {
              (i.chapterIndex++, (i.cardIndex = 0));
              continue;
            }
            i.parsedCards = (i.parsedCards || 0) + 1;
            let c = new Set(i.completedJobIds || []),
              l = new Set(i.discoveredJobIds || []),
              u = i.current ? Hg(i.current) : ``;
            for (let t of s) {
              let n = Hg(t);
              if (!l.has(n)) {
                if (
                  (l.add(n),
                  (i.detectedVideos = (i.detectedVideos || 0) + 1),
                  t.isPassed)
                ) {
                  c.has(n) || (i.passedVideos = (i.passedVideos || 0) + 1);
                  continue;
                }
                if (n !== u) {
                  if ((i.queuedVideos || 0) >= Vg)
                    throw new Xn(`视频任务点超过 ${Vg} 个，已停止扫描`);
                  if (!i.queueId) throw new Xn(`视频扫描队列标识缺失`);
                  (await this.storage.put(
                    Wg(e, i.queueId, i.queuedVideos || 0),
                    t,
                  ),
                    (i.queuedVideos = (i.queuedVideos || 0) + 1));
                }
              }
            }
            ((i.discoveredJobIds = [...l].slice(-Vg)),
              i.cardIndex++,
              i.current || (await this.startNextQueuedVideo(e, t, n, r)));
          }
        }
        if (t.video) {
          if (
            (i.current || (await this.startNextQueuedVideo(e, t, n, r)),
            i.scanComplete &&
              !i.current &&
              (i.queueIndex || 0) >= (i.queuedVideos || 0))
          ) {
            await this.completeVideoMount(
              e,
              t,
              `${i.course.name || `所选课程`}的所有未完成视频任务点已处理完毕，本次完成 ${i.completed} 个，请在学习通查收。`,
            );
            return;
          }
          if (i.scanComplete)
            i.current
              ? (t.nextAt = i.nextVideoAt || r + 6e4)
              : (t.nextAt = r + Bg);
          else {
            let e = `后台扫描节点：章节 ${Math.min(i.chapterIndex + 1, i.chapterIds?.length || 1)}/${i.chapterIds?.length || 1}`;
            ((i.status = i.current
              ? `正在学习：${i.current.name} ${i.current.playingTime}/${i.current.duration} 秒；${e}`
              : e),
              (t.nextAt = r + Bg));
          }
        }
      }
    }
    async command(e, t, n, r) {
      if (
        !/^\/(help|register|list|pass|location|status|stop|start|unregister)(?:$|\s|\+)/.test(
          t,
        )
      )
        return !1;
      if (n)
        return (
          t === `/help`
            ? await r(qg, !0)
            : await r(
                /^\/register/.test(t)
                  ? `请立即撤回含手机号和密码的消息！注册仅支持私聊机器人。`
                  : `请私聊机器人使用 /help 查看菜单和设置学习通。`,
              ),
          !0
        );
      if (
        (/^\/register(?:$|\s|\+)/.test(t) &&
          (await this.send(
            e,
            `请立即撤回刚才的注册消息，保护手机号和密码。机器人不会保存密码；撤回不会影响登录处理。`,
          )),
        t === `/help`)
      )
        return (await this.send(e, qg, !0), !0);
      if (t === `/status`) {
        let t = await this.storage.get(`cx:account:` + e);
        if (!t) await this.send(e, `尚未绑定，请私聊 /register 手机号 密码`);
        else {
          let n = this.videoStatus(t);
          await this.send(e, n.text, !0, n.progress);
        }
        return !0;
      }
      return (
        await this.serial(e, async () => {
          try {
            let n = `cx:account:` + e,
              r = await this.storage.get(n);
            if (/^\/register(?:$|\s|\+)/.test(t)) {
              let i = Yn(t);
              if (!i) {
                await this.send(
                  e,
                  `格式：/register 手机号 密码，或 /register+手机号+密码`,
                );
                return;
              }
              let a = `cx:login:` + e,
                o = (await this.storage.get(a)) || 0;
              if (Date.now() - o < 6e4) {
                await this.send(e, `请等待一分钟再尝试登录`);
                return;
              }
              if (
                !r &&
                (await this.storage.list({ prefix: `cx:account:`, limit: 200 }))
                  .size >= 200
              ) {
                await this.send(e, `当前机器人已达到 200 个监听账号上限`);
                return;
              }
              await this.storage.put(a, Date.now());
              let s = await this.client().login(i.phone, i.password);
              (r?.video && (await this.clearVideoQueue(e, r.video)),
                await this.storage.put(n, {
                  session: s,
                  location: r?.location,
                  enabled: !0,
                  nextAt: Date.now(),
                  refreshedAt: Date.now(),
                  cursor: 0,
                  failures: 0,
                  receipts: {},
                  outbox: [],
                  lastStatus: `登录成功，等待首次检查`,
                }),
                await this.send(
                  e,
                  `登录成功，已开启监听。检测到 ` +
                    s.courses.length +
                    ` 门根目录课程。普通签到自动提交；定位签到请先 /location。`,
                  !0,
                ));
              return;
            }
            if (t === `/unregister`) {
              (r?.video && (await this.clearVideoQueue(e, r.video)),
                await this.storage.delete(n),
                await this.storage.delete(`cx:login:` + e),
                await this.send(
                  e,
                  `已停止监听并删除保存的登录会话、位置和签到记录`,
                ));
              return;
            }
            if (!r) {
              await this.send(e, `尚未绑定，请私聊 /register 手机号 密码`);
              return;
            }
            if (t === `/list`) {
              let t = await this.client(r.session).courses();
              if (
                ((r.session.courses = t),
                (r.refreshedAt = Date.now()),
                await this.storage.put(n, r),
                !t.length)
              )
                await this.send(e, `当前根目录没有课程`);
              else {
                let n = t.map(
                  (e, t) => `${t + 1}. ${e.name || `课程 ${e.courseId}`}`,
                );
                for (let t = 0; t < n.length; t += 30)
                  await this.send(
                    e,
                    [
                      t
                        ? `课程列表（续 ${Math.floor(t / 30) + 1}）`
                        : `课程列表`,
                      ...n.slice(t, t + 30),
                      ...(t + 30 >= n.length
                        ? [`发送 /pass+课程序号 开始后台视频任务`]
                        : []),
                    ].join(`
`),
                  );
              }
              return;
            }
            if (/^\/pass(?:\+|\s+)/.test(t)) {
              let i = t.match(/^\/pass(?:\+|\s+)(\d{1,3})$/);
              if (!i) {
                await this.send(e, `格式：/pass+课程序号，例如 /pass+1`);
                return;
              }
              let a = Number(i[1]) - 1,
                o = r.session.courses[a],
                s =
                  Date.now() - r.refreshedAt <= 15 * 6e4 && o?.cpi && o.name
                    ? r.session.courses
                    : await this.client(r.session).courses();
              ((r.session.courses = s), (r.refreshedAt = Date.now()));
              let c = s[a];
              if (!c) {
                await this.send(
                  e,
                  `课程序号无效，请先发送 /list（当前共 ${s.length} 门）`,
                );
                return;
              }
              if (!c.cpi) {
                await this.send(
                  e,
                  `该课程缺少挂课所需标识，暂时无法挂载；请稍后重新 /list 再试`,
                );
                return;
              }
              (r.video && (await this.clearVideoQueue(e, r.video)),
                (r.video = {
                  course: c,
                  chapterIndex: 0,
                  cardIndex: 0,
                  completed: 0,
                  finalAttempts: 0,
                  status: `等待读取章节并扫描全部视频节点`,
                  protocolVersion: Rg,
                  scanComplete: !1,
                  queueId: crypto.randomUUID().replace(/-/g, ``),
                  queuedVideos: 0,
                  queueIndex: 0,
                  completedJobIds: [],
                }),
                (r.enabled = !0),
                (r.nextAt = Date.now()),
                (r.failures = 0),
                await this.storage.put(n, r),
                await this.send(
                  e,
                  `已挂载：${c.name || `课程 ${c.courseId}`}\n找到首个未完成视频后立即开始播放，并在后台继续扫描其余节点；可用 /status 查看，/stop 暂停。`,
                  !0,
                ));
              return;
            }
            if (t === `/stop`) r.enabled = !1;
            else if (t === `/start`)
              ((r.enabled = !0),
                (r.nextAt = Date.now()),
                (r.failures = 0),
                r.video?.cardJobs?.length &&
                  !r.video.current &&
                  (r.video.jobIndex || 0) > 0 &&
                  (r.video.jobIndex = 0));
            else if (t.startsWith(`/location`)) {
              let n = Qn(t);
              if (!n) {
                await this.send(
                  e,
                  `格式：/location 纬度 经度 地址；纬度 -90～90，经度 -180～180`,
                );
                return;
              }
              ((r.location = n), (r.nextAt = Date.now()));
              for (let [e, t] of Object.entries(r.receipts))
                t.startsWith(`需要位置`) && delete r.receipts[e];
            } else {
              await this.send(e, `命令格式有误，请发送 /help`);
              return;
            }
            (await this.storage.put(n, r),
              await this.send(
                e,
                t === `/stop`
                  ? `已暂停监听`
                  : t === `/start`
                    ? `已继续监听`
                    : `位置已保存，将携带 latitude、longitude 和 address 提交定位签到`,
              ));
          } catch (t) {
            await this.send(
              e,
              t instanceof Xn ? t.message : `处理失败，请稍后重试；密码未保存`,
            );
          }
        }),
        !0
      );
    }
    async nextAt() {
      let e = [
        ...(
          await this.storage.list({ prefix: `cx:account:`, limit: 200 })
        ).values(),
      ]
        .filter((e) => e.enabled || e.outbox.length)
        .map((e) => e.nextAt);
      return e.length ? Math.min(...e) : null;
    }
    async poll(e = Date.now()) {
      let t = await this.storage.list({ prefix: `cx:account:`, limit: 200 }),
        n = (e) =>
          !!(
            e.video &&
            e.video.protocolVersion !== Rg &&
            e.video.status === zg &&
            !e.enabled
          ),
        r = (e) =>
          !!(e.video && e.video.protocolVersion !== Rg && (e.enabled || n(e))),
        i = [...t]
          .filter(
            ([, t]) =>
              (t.enabled || t.outbox.length || r(t)) && (t.nextAt <= e || r(t)),
          )
          .sort((e, t) => e[1].nextAt - t[1].nextAt)
          .slice(0, 25);
      if (!i.length) return this.nextAt();
      let a = Jn(25),
        o = await Promise.allSettled(
          i.slice(0, 5).map(([t]) => {
            let i = t.slice(11);
            return this.serial(i, async () => {
              let o = await this.storage.get(t);
              if (!o) return;
              let s = n(o),
                c = r(o);
              if (c && o.video) {
                let t = o.video;
                (t.protocolVersion || 0) >= 15
                  ? ((t.protocolVersion = Rg),
                    (t.finalAttempts = 0),
                    (o.failures = 0),
                    console.log(
                      JSON.stringify({
                        event: `onebot_chaoxing_relay_recovery`,
                        protocolVersion: Rg,
                      }),
                    ))
                  : (t.protocolVersion || 0) >= 12
                    ? ((t.finalAttempts = 0),
                      (t.protocolVersion = Rg),
                      t.current
                        ? Kg(t, e)
                        : (Gg(t),
                          (t.status = `扫描策略已更新，正在从头核对全部视频节点`)),
                      s &&
                        ((o.enabled = !0),
                        (o.failures = 0),
                        (t.status = t.current
                          ? `当前视频继续学习，同时从头扫描后续视频节点`
                          : `扫描策略已更新，正在从头核对全部视频节点`),
                        console.log(
                          JSON.stringify({
                            event: `onebot_chaoxing_video_mount_resumed`,
                            protocolVersion: Rg,
                          }),
                        )))
                    : ((t.protocolVersion = Rg),
                      Gg(t),
                      (t.status = `扫描策略已更新，正在从头核对全部视频节点`));
              }
              if (
                !(
                  (!o.enabled && !o.outbox.length) ||
                  (o.nextAt > e && !c && !s)
                )
              ) {
                ((o.nextAt = e + 6e4), await this.storage.put(t, o));
                try {
                  if (o.enabled && o.outbox.length < 10) {
                    let n = this.client(o.session, a);
                    if (
                      ((o.lastStatus =
                        `最近检查：` +
                        new Date(e).toLocaleString(`zh-CN`, {
                          timeZone: `Asia/Shanghai`,
                        })),
                      await this.advanceVideo(i, o, n, e),
                      e - o.refreshedAt > 15 * 6e4 &&
                        ((o.session.courses = await n.courses()),
                        (o.refreshedAt = e)),
                      !o.lastActivityAt || e - o.lastActivityAt >= 6e4)
                    ) {
                      let r = o.session.courses,
                        i = Math.min(r.length, 10);
                      for (let a = 0; a < i; a++) {
                        let i = r[o.cursor % r.length];
                        for (let r of (await n.activities(i)).slice(0, 5)) {
                          let i = r.id;
                          if (
                            (r.otherId === 2 &&
                              ((o.qrActivities = {
                                ...(o.qrActivities || {}),
                                [i]: r,
                              }),
                              (o.qrActivities = Object.fromEntries(
                                Object.entries(o.qrActivities).slice(-20),
                              ))),
                            o.receipts[i])
                          )
                            continue;
                          let a = await n.sign(r, o.location);
                          ((o.receipts[i] = a), this.rememberSign(o, r, a, e));
                          let s = Object.entries(o.receipts).slice(-200);
                          if (
                            ((o.receipts = Object.fromEntries(s)),
                            o.outbox.push(
                              r.name +
                                `
活动 ` +
                                r.id +
                                `
` +
                                a,
                            ),
                            (o.session.cookies = n.cookies),
                            await this.storage.put(t, o),
                            o.outbox.length >= 10)
                          )
                            break;
                        }
                        if (
                          ((o.cursor = (o.cursor + 1) % r.length),
                          o.outbox.length >= 10)
                        )
                          break;
                      }
                      o.lastActivityAt = e;
                    }
                    ((o.session.cookies = n.cookies), (o.failures = 0));
                  }
                } catch (t) {
                  t instanceof qn
                    ? (o.nextAt = e + Bg)
                    : (o.failures++,
                      (o.lastStatus =
                        t instanceof Xn ? t.message : `检查失败，请稍后重试`),
                      (o.nextAt =
                        e +
                        Math.min(15 * 6e4, 6e4 * 2 ** Math.min(o.failures, 4))),
                      o.lastStatus.includes(`登录已失效`) && (o.enabled = !1),
                      (o.failures === 1 || !o.enabled) &&
                        o.outbox.push(o.lastStatus));
                }
                for (await this.storage.put(t, o); o.outbox.length; ) {
                  try {
                    await this.send(i, o.outbox[0], !0);
                  } catch {
                    break;
                  }
                  (o.outbox.shift(), await this.storage.put(t, o));
                }
              }
            });
          }),
        );
      for (let e of o)
        e.status === `rejected` &&
          console.error(
            JSON.stringify({
              event: `onebot_chaoxing_account_poll_failed`,
              reason: e.reason instanceof Error ? e.reason.message : `unknown`,
            }),
          );
      return this.nextAt();
    }
  };

export const MAX_CX_ACCOUNTS = 200;
export const CX_MENU = qg;
export const OneBotChaoxing = Jg;
