// @ts-nocheck
// Recovered from the owner's Cloudflare Worker version 345.
import { createHash as e } from "node:crypto";
var t = [
    `accept`,
    `accept-language`,
    `cache-control`,
    `content-type`,
    `cookie`,
    `pragma`,
    `referer`,
    `sec-ch-ua`,
    `sec-ch-ua-mobile`,
    `sec-ch-ua-platform`,
    `sec-fetch-dest`,
    `sec-fetch-mode`,
    `sec-fetch-site`,
    `user-agent`,
    `x-requested-with`,
  ],
  n = class extends Error {
    constructor() {
      (super(`本轮学习通请求预算已用完`),
        (this.name = `CxPollBudgetExhausted`));
    }
  };
function r(e) {
  let t = Math.max(0, Math.floor(e));
  return {
    take() {
      if (t === 0) throw new n();
      t--;
    },
    remaining: () => t,
  };
}
function i(e, t) {
  return async (n, r) => (t.take(), e(n, r));
}
function a(e, n = fetch) {
  let r = 0,
    i = [],
    a = async (e) => {
      if (r < 5) {
        r++;
        return;
      }
      await new Promise((t, n) => {
        let a = () => {
            (e?.removeEventListener(`abort`, o), r++, t());
          },
          o = () => {
            let t = i.indexOf(a);
            (t >= 0 && i.splice(t, 1),
              n(e?.reason || new DOMException(`Aborted`, `AbortError`)));
          };
        if (e?.aborted) {
          o();
          return;
        }
        (e?.addEventListener(`abort`, o, { once: !0 }), i.push(a));
      });
    },
    o = () => {
      (r--, i.shift()?.());
    };
  return async (r, i) => {
    let s = e.CHAOXING_RELAY_ORIGIN?.trim(),
      c = e.CHAOXING_RELAY_TOKEN?.trim();
    if (!s || !c) return n(r, i);
    let l = r instanceof Request ? r : new Request(r, i),
      u = (i?.method || l.method || `GET`).toUpperCase(),
      d = new Headers(l.headers);
    i?.headers && new Headers(i.headers).forEach((e, t) => d.set(t, e));
    let f = new Headers({
      authorization: `Bearer ${c}`,
      "x-chaoxing-target": l.url,
    });
    for (let e of t) {
      let t = d.get(e);
      t && f.set(e, t);
    }
    await a(i?.signal);
    try {
      let e = await n(new URL(`/internal/chaoxing-relay`, s), {
        method: u,
        headers: f,
        body: u === `GET` || u === `HEAD` ? void 0 : (i?.body ?? l.body),
        redirect: `manual`,
        signal: i?.signal,
      });
      if (e.status >= 500) {
        await e.body?.cancel();
        let t = Error(`Chaoxing relay returned HTTP ${e.status}`);
        throw ((t.name = `ChaoxingRelayError`), t);
      }
      return e;
    } catch (e) {
      let t = e instanceof Error ? `${e.name} ${e.message}` : ``,
        n = Error(`Chaoxing relay request failed`);
      throw (
        (n.name = /timeout/i.test(t)
          ? `ChaoxingRelayTimeoutError`
          : `ChaoxingRelayError`),
        n
      );
    } finally {
      o();
    }
  };
}
var o = `https://mobilelearn.chaoxing.com`,
  s = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`,
  c = class extends Error {},
  l = (e) => (e && typeof e == `object` && !Array.isArray(e) ? e : {}),
  u = (e) => (/^\d+$/.test(String(e)) ? String(e) : ``),
  d = (e) =>
    e
      .replace(/<[^>]*>/g, ` `)
      .replace(/&nbsp;|&#160;/gi, ` `)
      .replace(/&amp;/gi, `&`)
      .replace(/&quot;|&#34;/gi, `"`)
      .replace(/&#39;|&apos;/gi, `'`)
      .replace(/&lt;/gi, `<`)
      .replace(/&gt;/gi, `>`)
      .replace(/\s+/g, ` `)
      .trim();
function f(e) {
  let t = new Map(),
    n = e.split(/<li\b/i);
  for (let e of n) {
    let n = (t) =>
        e.match(
          RegExp(`<input[^>]+name=["']${t}["'][^>]+value=["'](\\d+)["']`, `i`),
        )?.[1] ||
        e.match(
          RegExp(`<input[^>]+value=["'](\\d+)["'][^>]+name=["']${t}["']`, `i`),
        )?.[1],
      r = n(`courseId`),
      i = n(`classId`);
    if (!r || !i) continue;
    let a =
        (
          e.match(
            /href=["']([^"']*(?:courseId|courseid)=\d+[^"']*)["']/i,
          )?.[1] || ``
        ).match(/[?&]cpi=(\d+)/i)?.[1] || n(`cpi`),
      o =
        e.match(/<h3\b[^>]*>[\s\S]*?<a\b[^>]*title=["']([^"']+)["']/i)?.[1] ||
        e.match(/<h3\b[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
        e.match(
          /class=["'][^"']*(?:courseName|course-name)[^"']*["'][^>]*>([\s\S]*?)<\//i,
        )?.[1];
    t.set(`${r}:${i}`, {
      courseId: r,
      classId: i,
      ...(o ? { name: d(o).slice(0, 100) } : {}),
      ...(a ? { cpi: a } : {}),
    });
  }
  for (let n of e.matchAll(/course_(\d+)_(\d+)["']/g)) {
    let e = `${n[1]}:${n[2]}`;
    t.has(e) || t.set(e, { courseId: n[1], classId: n[2] });
  }
  return [...t.values()];
}
function p(e) {
  let t = l(e);
  if (!Array.isArray(t.channelList)) throw new c(`课程接口返回异常`);
  let n = new Map();
  for (let e of t.channelList) {
    let t = l(e),
      r = l(t.content),
      i = Number(r.roletype ?? r.roleType);
    if (Number.isFinite(i) && i !== 3) continue;
    let a = l(r.course),
      o = Array.isArray(a.data) ? l(a.data[0]) : a,
      s = u(o.id) || u(r.courseId) || u(r.courseid) || u(t.courseId),
      c =
        u(r.id) || u(r.clazzId) || u(r.classId) || u(t.clazzId) || u(t.classId);
    if (!s || !c) continue;
    let f = u(r.cpi) || u(t.cpi),
      p = d(
        String(
          o.name || o.title || r.name || r.title || t.name || t.title || ``,
        ),
      ).slice(0, 100);
    n.set(`${s}:${c}`, {
      courseId: s,
      classId: c,
      ...(p ? { name: p } : {}),
      ...(f ? { cpi: f } : {}),
    });
  }
  return [...n.values()];
}
function m(e) {
  let t = [];
  for (let n of [
    /(?:[?&]|&amp;)(?:chapterId|knowledgeId)=(\d{1,20})/gi,
    /\bid\s*=\s*["']cur(\d{1,20})["']/gi,
    /\b(?:data-)?knowledgeid\s*=\s*["']?(\d{1,20})/gi,
  ])
    for (let r of e.matchAll(n)) t.push({ index: r.index, id: r[1] });
  return (
    t.sort((e, t) => e.index - t.index),
    [...new Set(t.map((e) => e.id))]
  );
}
function h(e) {
  let t = e
    .replace(/&amp;/gi, `&`)
    .replace(/%3A%2F%2F/gi, `://`)
    .replace(/\\\//g, `/`)
    .match(/https?:\/\/(mooc1(?:-\d+)?\.chaoxing\.com)(?:\/mooc-ans)?/i);
  return t ? `https://${t[1].toLowerCase()}` : null;
}
function g(e, t) {
  t.lastIndex = 0;
  for (let n = t.exec(e); n; n = t.exec(e)) {
    let r = e.indexOf(`{`, n.index + n[0].length);
    if (r < 0) continue;
    let i = e.slice(t.lastIndex).search(/\bmArg\s*=/);
    if (i >= 0 && r >= t.lastIndex + i) continue;
    let a = 0,
      o = ``,
      s = !1;
    for (let t = r; t < e.length; t++) {
      let n = e[t];
      if (o) {
        s ? (s = !1) : n === `\\` ? (s = !0) : n === o && (o = ``);
        continue;
      }
      if (n === `"` || n === `'`) {
        o = n;
        continue;
      }
      if (n === `{`) a++;
      else if (n === `}` && --a === 0) {
        let n = e.slice(r, t + 1);
        try {
          let e = l(JSON.parse(n));
          if (Array.isArray(e.attachments)) return e;
          break;
        } catch {
          let e = [...n]
            .filter((e) => {
              let t = e.charCodeAt(0);
              return t >= 32 && t !== 127;
            })
            .join(``);
          try {
            let t = l(JSON.parse(e));
            if (Array.isArray(t.attachments)) return t;
            break;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}
function _(e) {
  return e
    .replace(/&quot;|&#34;/gi, `"`)
    .replace(/&#39;|&apos;/gi, `'`)
    .replace(/&amp;/gi, `&`)
    .replace(/&lt;/gi, `<`)
    .replace(/&gt;/gi, `>`);
}
function v(...e) {
  return e.some(
    (e) =>
      e === !0 ||
      e === 1 ||
      /^(?:1|true|passed|finished|completed|complete)$/i.test(
        String(e ?? ``).trim(),
      ),
  );
}
function y(e) {
  let t = [];
  for (let n of e.matchAll(/<iframe\b[^>]*>/gi)) {
    let r = n[0],
      i = (e) => {
        let t = r.match(RegExp(`\\b${e}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, `i`));
        return t ? _(t[2]) : ``;
      },
      a = i(`data`);
    if (!a) continue;
    let o;
    try {
      o = l(JSON.parse(a));
    } catch {
      continue;
    }
    let s = i(`src`),
      c = i(`class`),
      u = [
        s,
        c,
        o.module,
        o.type,
        o.resourceType,
        o.objectid,
        o.objectId,
        o.mid,
      ]
        .filter(Boolean)
        .join(` `),
      d = String(o.name || o.title || o.filename || `视频任务`);
    if (
      !/\/video\/|ans-insertvideo|\.(?:mp4|m4v|flv|avi|mov|wmv|vob)(?:\b|$)|\bvideo\b/i.test(
        `${u} ${d}`,
      )
    )
      continue;
    let f = n.index ?? 0,
      p = e.slice(Math.max(0, f - 400), f);
    t.push({
      job: !0,
      jobid: i(`jobid`) || o.jobid || o._jobid || ``,
      type: `video`,
      objectId: o.objectId || o.objectid || ``,
      otherInfo: o.otherInfo || o.otherinfo || o.mid || ``,
      mid: o.mid || ``,
      isPassed:
        /ans-job-finished|job-finished|task-finished/i.test(`${p} ${c}`) ||
        v(
          o.isPassed,
          o.ispassed,
          o.passed,
          o.finished,
          o.completed,
          o.jobFinished,
          o.jobfinished,
        ),
      property: {
        ...o,
        name: d,
        module: `video`,
        objectId: o.objectId || o.objectid,
        objectid: o.objectid || o.objectId,
      },
    });
  }
  return t.length ? { attachments: t } : null;
}
function b(e, t) {
  let n = Array.isArray(e?.attachments) ? e.attachments : [],
    r = l(e?.defaults),
    i = String(r.initdataUrl || ``).slice(0, 1e3),
    a = String(r.reportUrl || ``).slice(0, 1e3),
    o = u(r.userid || r.userId),
    s = u(r.fid),
    d = String(e?.jobid || r.jobid || r._jobid || ``).slice(0, 160);
  return n.flatMap((e) => {
    let n = l(e),
      r = l(n.property),
      f = String(n.type || r.module || r.type || ``).toLowerCase();
    if (!f.includes(`video`) && !f.includes(`mp4`)) return [];
    let p = String(n.jobid || r.jobid || r._jobid || d).slice(0, 160),
      m = String(
        n.objectid || n.objectId || r.objectid || r.objectId || ``,
      ).slice(0, 160),
      h = n.job === !0 || Number(n.job) === 1 || !!p;
    if (!p || !m) {
      if (h)
        throw new c(`检测到视频任务，但任务标识不完整；已保留挂载并稍后重试`);
      return [];
    }
    let g = String(n.otherInfo || n.otherinfo || ``);
    return [
      {
        knowledgeId: t,
        jobId: p,
        objectId: m,
        name: String(n.name || r.name || `视频任务`).slice(0, 100),
        otherInfo: g.split(`&`, 1)[0].slice(0, 500),
        playTime: Math.max(0, Math.floor(Number(n.playTime || 0) / 1e3)),
        isPassed: v(
          n.isPassed,
          n.ispassed,
          n.passed,
          n.finished,
          n.completed,
          n.jobFinished,
          n.jobfinished,
          n.jobStatus,
          n.jobstatus,
          n.taskStatus,
          n.taskstatus,
          r.isPassed,
          r.ispassed,
          r.passed,
          r.finished,
          r.completed,
          r.jobFinished,
          r.jobfinished,
          r.jobStatus,
          r.jobstatus,
          r.taskStatus,
          r.taskstatus,
        ),
        ...(n.rt || /-rt_([1d])/.test(g)
          ? {
              rt: n.rt
                ? String(n.rt).slice(0, 16)
                : /-rt_d/.test(g)
                  ? `0.9`
                  : `1`,
            }
          : {}),
        ...(n.videoFaceCaptureEnc
          ? { videoFaceCaptureEnc: String(n.videoFaceCaptureEnc).slice(0, 500) }
          : {}),
        ...(n.attDuration
          ? { attDuration: String(n.attDuration).slice(0, 100) }
          : {}),
        ...(n.attDurationEnc
          ? { attDurationEnc: String(n.attDurationEnc).slice(0, 500) }
          : {}),
        ...(r.mid || n.mid
          ? { interactionMid: String(r.mid || n.mid).slice(0, 200) }
          : {}),
        ...(i ? { interactionUrl: i } : {}),
        ...(n.reportUrl || r.reportUrl || a
          ? { reportUrl: String(n.reportUrl || r.reportUrl || a).slice(0, 1e3) }
          : {}),
        ...(u(n.userid || n.userId || r.userid || r.userId) || o
          ? {
              reportUserId:
                u(n.userid || n.userId || r.userid || r.userId) || o,
            }
          : {}),
        ...(u(n.fid || r.fid) || s ? { fid: u(n.fid || r.fid) || s } : {}),
      },
    ];
  });
}
function x(e, t) {
  let n = g(e, /\bmArg\s*=/g) || y(e);
  if (n) return b(n, t);
  if (
    /passport2\.chaoxing\.com|id=["']login|name=["']password|登录后继续|账号登录/i.test(
      e,
    )
  )
    throw new c(`学习通网页会话未建立，请重新 /register 后再挂载课程`);
  if (/验证码|安全验证|访问过于频繁|异常访问|risk|captcha/i.test(e))
    throw new c(
      `学习通触发了安全验证，暂时无法读取视频任务点；请稍后重试或配置国内中转`,
    );
  return /章节未开放|暂未开放|无权访问/.test(e) ? [] : null;
}
function S(e) {
  let t = new Set(),
    n = [],
    r = [{ value: e, depth: 0 }],
    i = new Set(),
    a = 0;
  for (; r.length && a++ < 500; ) {
    let e = r.shift();
    if (e.depth > 6 || !e.value || typeof e.value != `object` || i.has(e.value))
      continue;
    if ((i.add(e.value), Array.isArray(e.value))) {
      for (let t of e.value.slice(0, 200))
        r.push({ value: t, depth: e.depth + 1 });
      continue;
    }
    let a = l(e.value),
      o = String(a.resourceId ?? a.resourceid ?? a.id ?? ``).slice(0, 200),
      s = Number(a.startTime ?? a.starttime ?? a.time),
      c = Math.max(0, Math.floor(s)),
      u = String(
        a.validationUrl ?? a.validationurl ?? a.validateUrl ?? ``,
      ).slice(0, 1e3),
      f = (
        Array.isArray(a.options)
          ? a.options
          : Array.isArray(a.answers)
            ? a.answers
            : []
      )
        .map(l)
        .find((e) => v(e.isRight, e.isright, e.right, e.correct)),
      p = String(f?.name ?? f?.value ?? f?.key ?? ``).slice(0, 100);
    o &&
      Number.isFinite(s) &&
      u &&
      p &&
      !t.has(o) &&
      (t.add(o),
      n.push({
        resourceId: o,
        startTime: c,
        validationUrl: u,
        answer: p,
        description:
          d(String(a.description ?? a.title ?? `视频互动题`)).slice(0, 120) ||
          `视频互动题`,
      }));
    for (let t of [
      `datas`,
      `data`,
      `result`,
      `questions`,
      `questionList`,
      `records`,
    ]) {
      let n = a[t];
      n && typeof n == `object` && r.push({ value: n, depth: e.depth + 1 });
    }
  }
  return n.sort((e, t) => e.startTime - t.startTime);
}
function C(e, t) {
  let n = l(e),
    r = l(n.data),
    i = 0,
    a = t.filter((e) => {
      let t = l(n[e] || r[e]);
      if (!(`unfinishcount` in t)) return !0;
      let a = Number(t.unfinishcount);
      return Number.isFinite(a) ? (i++, a > 0) : !0;
    });
  return i ? a : t;
}
function w(e) {
  let t = e.match(
    /^\/location\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(.{1,160})$/u,
  );
  if (!t) return null;
  let n = Number(t[1]),
    r = Number(t[2]),
    i = t[3].trim();
  return Math.abs(n) <= 90 && Math.abs(r) <= 180 && i
    ? { latitude: n, longitude: r, address: i }
    : null;
}
function T(e) {
  let t = e.match(/^\/register(?:\+|\s+)(1\d{10})(?:\+|\s)([^\r\n]{1,128})$/);
  return t ? { phone: t[1], password: t[2] } : null;
}
function E(e, t) {
  let n = l(e),
    r = l(n.data),
    i = Array.isArray(r.activeList)
      ? r.activeList
      : Array.isArray(n.activeList)
        ? n.activeList
        : null;
  if (!i) throw new c(`学习通活动接口暂不可用，请稍后重试`);
  return i.flatMap((e) => {
    let n = l(e),
      r = u(n.id),
      i = Number(n.activeType),
      a = Number(n.otherId),
      o = Number.isFinite(a) ? a : i === 2 ? 0 : NaN,
      s = !Number.isFinite(i) || i === 2;
    return r && Number(n.status) === 1 && s && [0, 2, 3, 4, 5].includes(o)
      ? [
          {
            ...t,
            id: r,
            name: String(n.nameOne || `课程签到`).slice(0, 60),
            otherId: o,
          },
        ]
      : [];
  });
}
var D = class {
  constructor(e = {}, t = fetch) {
    ((this.cookies = { ...e }), (this.request = t));
  }
  async text(e, t = {}, r = {}) {
    let i = new Headers(t.headers);
    i.has(`User-Agent`) || i.set(`User-Agent`, s);
    let a = Object.entries(this.cookies)
      .map(([e, t]) => e + `=` + t)
      .join(`; `);
    a && i.set(`Cookie`, a);
    let o = null,
      l,
      u = r.timeoutMs ?? (e.includes(`passport2.chaoxing.com`) ? 2e4 : 15e3),
      d = r.attempts ?? 2;
    for (let r = 0; r < d && !o; r++)
      try {
        o = await this.request(e, {
          ...t,
          headers: i,
          redirect: `manual`,
          signal: AbortSignal.timeout(u),
        });
      } catch (e) {
        if (e instanceof n) throw e;
        ((l = e),
          r + 1 < d && (await new Promise((e) => setTimeout(e, 300 * 2 ** r))));
      }
    if (!o) {
      let e = l instanceof Error && /timeout/i.test(`${l.name} ${l.message}`),
        t = l instanceof Error && /^ChaoxingRelay/.test(l.name);
      throw new c(
        e
          ? `学习通响应超过 ${u / 1e3} 秒，请稍后重试`
          : t
            ? `学习通本机中转链路瞬时失败，已保留当前任务并将在稍后重试`
            : `Cloudflare 无法连接学习通；可能是学习通限制了当前服务器出口 IP`,
      );
    }
    if ((o.status >= 300 && o.status < 400) || o.status === 401)
      throw new c(`登录已失效，请重新 /register`);
    if (o.status === 429)
      throw new c(`学习通请求过于频繁，已自动减速并稍后重试`);
    if (o.status === 403)
      throw new c(`学习通暂时拒绝访问，已保留当前视频并稍后重试`);
    if (!o.ok) throw new c(`学习通服务暂不可用，请稍后重试`);
    for (let e of o.headers.getSetCookie()) {
      let t = e.split(`;`, 1)[0],
        n = t.indexOf(`=`);
      n > 0 && (this.cookies[t.slice(0, n)] = t.slice(n + 1));
    }
    let f = await o.text();
    if (f.length > 2e6) throw new c(`学习通响应异常`);
    return f;
  }
  async json(e, t = {}, n = {}) {
    return l(await this.jsonValue(e, t, n));
  }
  async jsonValue(e, t = {}, n = {}) {
    let r = await this.text(e, t, n);
    try {
      return JSON.parse(r);
    } catch {
      throw new c(`学习通接口返回异常，请检查登录状态`);
    }
  }
  chaoxingUrl(e, t = `https://mooc1.chaoxing.com`) {
    let n;
    try {
      n = new URL(e, t);
    } catch {
      throw new c(`视频互动题地址无效`);
    }
    if (
      (n.protocol === `http:` && (n.protocol = `https:`),
      n.protocol !== `https:` || !/(^|\.)chaoxing\.com$/i.test(n.hostname))
    )
      throw new c(`视频互动题地址不受信任`);
    return n;
  }
  async login(e, t) {
    let n = !1,
      r = new URLSearchParams({
        uname: e,
        code: t,
        loginType: `1`,
        roleSelect: `true`,
      });
    try {
      let e = await this.json(
          `https://passport2-api.chaoxing.com/v11/loginregister?cx_xxt_passport=json`,
          {
            method: `POST`,
            body: r,
            headers: {
              "Content-Type": `application/x-www-form-urlencoded; charset=UTF-8`,
            },
          },
          { attempts: 1, timeoutMs: 12e3 },
        ),
        t = u(e.uid) || u(e.puid);
      (t && !this.cookies._uid && (this.cookies._uid = t),
        (e.status === !0 || e.mes === `验证通过`) &&
          u(this.cookies._uid) &&
          (n = !0));
    } catch (e) {
      if (!(e instanceof c)) throw e;
    }
    let i = new TextEncoder().encode(`u2oh6Vu^HWe4_AES`),
      a = await crypto.subtle.importKey(`raw`, i, `AES-CBC`, !1, [`encrypt`]),
      o = async (e) => {
        let t = new Uint8Array(
          await crypto.subtle.encrypt(
            { name: `AES-CBC`, iv: i },
            a,
            new TextEncoder().encode(e),
          ),
        );
        return btoa(String.fromCharCode(...t));
      },
      s = new URLSearchParams({
        fid: `-1`,
        uname: await o(e),
        password: await o(t),
        refer: `https%3A%2F%2Fi.chaoxing.com`,
        t: `true`,
        forbidotherlogin: `0`,
        validate: ``,
        doubleFactorLogin: `0`,
      }),
      l;
    try {
      l = await this.json(
        `https://passport2.chaoxing.com/fanyalogin`,
        { method: `POST`, body: s },
        { attempts: 1, timeoutMs: 12e3 },
      );
    } catch (e) {
      if (n) return { cookies: this.cookies, courses: await this.courses() };
      throw e instanceof c && /响应超过|Cloudflare 无法连接/.test(e.message)
        ? new c(
            `Cloudflare 无法连接学习通的两条登录线路，需要配置可访问学习通的国内代理`,
          )
        : e;
    }
    if (l.status !== !0 || !u(this.cookies._uid)) {
      if (n) return { cookies: this.cookies, courses: await this.courses() };
      throw new c(`登录失败，请核对账号密码；如需验证码，请先在学习通完成验证`);
    }
    return { cookies: this.cookies, courses: await this.courses() };
  }
  async courses() {
    try {
      return p(
        await this.json(
          `https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1`,
        ),
      );
    } catch (e) {
      if (
        e instanceof n ||
        (e instanceof c && e.message.includes(`登录已失效`))
      )
        throw e;
      let t = await this.text(
        `https://mooc1-1.chaoxing.com/visit/courselistdata`,
        {
          method: `POST`,
          body: new URLSearchParams({
            courseType: `1`,
            courseFolderId: `0`,
            courseFolderSize: `0`,
          }),
        },
      );
      if (/passport2\.chaoxing\.com|name=["']password/i.test(t))
        throw new c(`登录已失效，请重新 /register`);
      let r = f(t);
      if (!r.length && !/暂无|没有|course|课程/i.test(t))
        throw new c(`课程接口返回异常`);
      return r;
    }
  }
  async chapters(e) {
    let t = await this.text(
        `https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse?` +
          new URLSearchParams({
            courseid: e.courseId,
            clazzid: e.classId,
            cpi: e.cpi || ``,
            ut: `s`,
          }),
      ),
      n = h(t);
    return (n && (e.moocOrigin = n), m(t));
  }
  async unfinishedChapters(e, t) {
    if (!t.length || !e.cpi || !u(this.cookies._uid)) return t;
    try {
      return C(
        await this.json(`https://mooc1-api.chaoxing.com/job/myjobsnodesmap`, {
          method: `POST`,
          body: new URLSearchParams({
            view: `json`,
            nodes: t.join(`,`),
            clazzid: e.classId,
            userid: this.cookies._uid,
            cpi: e.cpi,
            courseid: e.courseId,
            time: String(Date.now()),
          }),
          headers: {
            "User-Agent": `Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 ChaoXingStudy`,
          },
        }),
        t,
      );
    } catch (e) {
      if (e instanceof n) throw e;
      return t;
    }
  }
  async videoJobs(e, t, r) {
    let i = e.moocOrigin || `https://mooc1.chaoxing.com`,
      a = crypto.randomUUID().replace(/-/g, ``),
      o =
        i +
        `/mycourse/studentstudy?` +
        new URLSearchParams({
          chapterId: t,
          courseId: e.courseId,
          clazzid: e.classId,
          cpi: e.cpi || ``,
          enc: a,
          mooc2: `1`,
          hidetype: `0`,
          openc: a,
        });
    r === 0 &&
      (await this.text(
        i +
          `/mooc-ans/mycourse/studentstudyAjax?` +
          new URLSearchParams({
            courseId: e.courseId,
            clazzid: e.classId,
            chapterId: t,
            cpi: e.cpi || ``,
            verificationcode: ``,
            mooc2: `1`,
            toComputer: `false`,
            microTopicId: `0`,
            editorPreview: `0`,
            isPreviewVideo: `false`,
            videoWidth: `0`,
            videoHeight: `0`,
            targetVideoJobId: ``,
            cardIndex: `0`,
          }),
        { headers: { Referer: o } },
      ),
      await this.text(
        i +
          `/mooc-ans/edit/validatejobcount?` +
          new URLSearchParams({
            courseId: e.courseId,
            clazzid: e.classId,
            nodeid: t,
          }),
        { headers: { Referer: o } },
      ));
    let s = new URLSearchParams({
      clazzid: e.classId,
      courseid: e.courseId,
      knowledgeid: t,
      num: String(r),
      isPhone: `0`,
      control: `true`,
      cpi: e.cpi || ``,
    });
    try {
      let e = x(
        await this.text(`https://mooc1-api.chaoxing.com/knowledge/cards?` + s, {
          headers: {
            Accept: `*/*`,
            "User-Agent": `Mozilla/5.0 (Linux; Android 12; SM-N9006 Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36 com.chaoxing.mobile/ChaoXingStudy_3_6.3.7_android_phone_10822_249`,
          },
        }),
        t,
      );
      if (e !== null)
        return e.map((e) => ({ ...e, mediaOrigin: e.mediaOrigin || i }));
    } catch (e) {
      if (
        e instanceof n ||
        (e instanceof c && /登录已失效|安全验证/.test(e.message))
      )
        throw e;
    }
    let l = x(
      await this.text(
        i +
          `/mooc-ans/knowledge/cards?` +
          new URLSearchParams({
            clazzid: e.classId,
            courseid: e.courseId,
            knowledgeid: t,
            ut: `s`,
            cpi: e.cpi || ``,
            v: `2025-0424-1038-3`,
            mooc2: `1`,
            num: String(r),
            isMicroCourse: `false`,
            editorPreview: `0`,
          }),
        { headers: { Referer: o } },
      ),
      t,
    );
    return l?.map((e) => ({ ...e, mediaOrigin: i })) ?? l;
  }
  async videoProgress(e, t = Date.now()) {
    let n = `https://mooc1-api.chaoxing.com`,
      r = (n) =>
        this.json(
          `${n}/ananas/status/${encodeURIComponent(e.objectId)}?` +
            new URLSearchParams({
              k: e.fid || this.cookies.fid || `0`,
              flag: `normal`,
              _dc: String(t),
            }),
          {
            headers: {
              Referer: `${n}/ananas/modules/video/index.html`,
              "X-Requested-With": `XMLHttpRequest`,
              Accept: `application/json, text/javascript, */*; q=0.01`,
            },
          },
        ),
      i;
    try {
      i = await r(n);
    } catch (e) {
      throw e instanceof c && e.message.includes(`拒绝访问`)
        ? new c(
            `学习通 API 拒绝 Cloudflare 出口访问视频接口；当前视频已保留，需要配置国内中转后继续`,
          )
        : e;
    }
    if (
      i.status !== `success` ||
      !i.dtoken ||
      !Number.isFinite(Number(i.duration))
    )
      throw new c(`视频任务信息暂不可用`);
    let a = Math.max(0, Math.floor(Number(i.duration))),
      o = Math.min(
        a,
        Math.max(e.playTime, Math.floor(Number(i.playTime || 0) / 1e3)),
      ),
      s = v(
        i.isPassed,
        i.ispassed,
        i.passed,
        i.finished,
        i.completed,
        i.complete,
        l(i.data).isPassed,
        l(i.data).passed,
        l(i.data).finished,
        l(i.data).completed,
      ),
      u = await this.videoInteractions(e, o);
    return {
      ...e,
      mediaOrigin: e.mediaOrigin || n,
      duration: a,
      dtoken: String(i.dtoken).slice(0, 500),
      isPassed: e.isPassed || s,
      playingTime: o,
      lastTickAt: t,
      ...(u.length ? { interactions: u, answeredInteractions: [] } : {}),
    };
  }
  async videoInteractions(e, t) {
    if (!e.interactionMid) return [];
    let n = this.chaoxingUrl(
      e.interactionUrl || `/richvideo/initdatawithviewer`,
      e.mediaOrigin,
    );
    return (
      n.searchParams.set(
        `start`,
        Number.isFinite(t) ? String(Math.max(0, Math.floor(t))) : `undefined`,
      ),
      n.searchParams.set(`mid`, e.interactionMid),
      S(await this.jsonValue(n.toString()))
    );
  }
  async answerVideoInteraction(e) {
    let t = this.chaoxingUrl(e.validationUrl);
    (t.searchParams.set(`resourceid`, e.resourceId),
      t.searchParams.set(`answer`, e.answer));
    let n = (await this.text(t.toString())).trim();
    if (/错误|失败|incorrect|error/i.test(n))
      throw new c(`视频互动题未通过：${e.description}`);
  }
  async reportVideo(t, n, r, i = !1) {
    if (!t.cpi) throw new c(`课程缺少 cpi，暂时无法挂载视频任务`);
    let a = Math.max(0, Math.min(n.duration, Math.floor(r))),
      o = n.reportUserId || this.cookies._uid;
    if (!u(o)) throw new c(`视频任务缺少有效用户标识，已保留并稍后重试`);
    let s = `[${t.classId}][${o}][${n.jobId}][${n.objectId}][${a * 1e3}][d_yHJ!$pdA~5][${n.duration * 1e3}][0_${n.duration}]`,
      l = new URLSearchParams({
        clazzId: t.classId,
        playingTime: String(a),
        duration: String(n.duration),
        clipTime: `0_${n.duration}`,
        objectId: n.objectId,
        otherInfo: n.otherInfo,
        courseId: t.courseId,
        jobid: n.jobId,
        userid: o,
        isdrag: i ? `4` : `3`,
        view: `pc`,
        enc: e(`md5`).update(s).digest(`hex`),
        dtype: `Video`,
        rt: n.rt || `0.9`,
        _t: String(Date.now()),
      });
    (l.set(`videoFaceCaptureEnc`, n.videoFaceCaptureEnc || ``),
      l.set(`attDuration`, n.attDuration || String(n.duration)),
      l.set(`attDurationEnc`, n.attDurationEnc || ``));
    let d = t.moocOrigin || n.mediaOrigin || `https://mooc1.chaoxing.com`,
      f = this.chaoxingUrl(
        n.reportUrl ||
          `${d}/mooc-ans/multimedia/log/a/${encodeURIComponent(t.cpi)}`,
        d,
      );
    if (!/\/(?:mooc-ans\/)?multimedia\/log\/a(?:\/|$)/i.test(f.pathname))
      throw new c(`视频进度上报地址无效`);
    ((f.pathname = f.pathname.replace(/\/+$/, ``)),
      /\/a$/i.test(f.pathname) &&
        (f.pathname += `/${encodeURIComponent(t.cpi)}`),
      f.pathname.endsWith(`/${encodeURIComponent(n.dtoken)}`) ||
        (f.pathname += `/${encodeURIComponent(n.dtoken)}`),
      (f.search = l.toString()),
      (this.cookies.fanyamoocs ||= `11401F839C536D9E`),
      (this.cookies.thirdRegist ||= `0`),
      (this.cookies.videojs_id ||= `1778753`));
    let p = {
        Accept: `*/*`,
        "Accept-Language": `zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7`,
        "Cache-Control": `no-cache`,
        "Content-Type": `application/json`,
        Pragma: `no-cache`,
        Referer: `${f.origin}/ananas/modules/video/index.html?v=2023-1110-1610`,
        "Sec-Ch-Ua": `"Chromium";v="139", "Not;A=Brand";v="99", "Microsoft Edge";v="139"`,
        "Sec-Ch-Ua-Mobile": `?0`,
        "Sec-Ch-Ua-Platform": `"Windows"`,
        "Sec-Fetch-Dest": `empty`,
        "Sec-Fetch-Mode": `cors`,
        "Sec-Fetch-Site": `same-origin`,
        "X-Requested-With": `XMLHttpRequest`,
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0`,
      },
      m;
    try {
      m = await this.json(f.toString(), { headers: p });
    } catch (e) {
      if (!(e instanceof c) || !e.message.includes(`拒绝访问`)) throw e;
      if (!n.reportUrl && f.pathname.includes(`/mooc-ans/`)) {
        let e = new URL(f);
        e.pathname = e.pathname.replace(`/mooc-ans/`, `/`);
        try {
          m = await this.json(e.toString(), {
            headers: {
              ...p,
              Referer: `${e.origin}/ananas/modules/video/index.html?v=2023-1110-1610`,
            },
          });
        } catch (e) {
          if (!(e instanceof c) || !e.message.includes(`拒绝访问`)) throw e;
          m = {};
        }
        if (typeof m.isPassed == `boolean`) return m.isPassed;
      }
      let r = new URLSearchParams(l);
      (r.set(`view`, `json`), r.set(`akid`, `null`));
      let a = `https://mooc1-api.chaoxing.com/multimedia/log/a/${encodeURIComponent(t.cpi)}/${encodeURIComponent(n.dtoken)}?${r}`,
        o = {
          Accept: `*/*`,
          "Accept-Language": `zh-CN,zh;q=0.9`,
          "Content-Type": `application/json`,
          Referer: `https://mooc1-api.chaoxing.com/ananas/modules/video/index_wap.html?v=372024-1121-1947`,
          "Sec-Fetch-Dest": `empty`,
          "Sec-Fetch-Mode": `cors`,
          "Sec-Fetch-Site": `same-origin`,
          "X-Requested-With": `XMLHttpRequest`,
          "User-Agent": `Mozilla/5.0 (Linux; Android 12; SM-N9006 Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36 com.chaoxing.mobile/ChaoXingStudy_3_6.3.7_android_phone_10822_249`,
        };
      try {
        m = await this.json(a, { headers: o });
      } catch (e) {
        if (!(e instanceof c) || !e.message.includes(`拒绝访问`)) throw e;
        (r.set(`isdrag`, i ? `4` : `0`), r.delete(`courseId`), r.delete(`rt`));
        let t = `https://mooc1-api.chaoxing.com/multimedia/log/${encodeURIComponent(n.dtoken)}?${r}`;
        m = await this.json(t, { headers: o });
      }
    }
    if (typeof m.isPassed != `boolean`) throw new c(`视频进度上报返回异常`);
    return m.isPassed;
  }
  async activities(e) {
    try {
      return E(
        await this.json(
          o +
            `/v2/apis/active/student/activelist?` +
            new URLSearchParams({
              courseId: e.courseId,
              classId: e.classId,
              fid: `0`,
              showNotStartedActive: `0`,
              _: String(Date.now()),
            }),
        ),
        e,
      );
    } catch (t) {
      if (
        t instanceof n ||
        (t instanceof c && t.message.includes(`登录已失效`))
      )
        throw t;
      return E(
        await this.json(
          o +
            `/ppt/activeAPI/taskactivelist?` +
            new URLSearchParams({
              courseId: e.courseId,
              classId: e.classId,
              uid: this.cookies._uid || ``,
              cpi: e.cpi || ``,
            }),
          {
            headers: {
              "User-Agent": `Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 com.ssreader.ChaoXingStudy`,
            },
          },
        ),
        e,
      );
    }
  }
  async sign(e, t) {
    let n = l(
      (await this.json(o + `/v2/apis/active/getPPTActiveInfo?activeId=` + e.id))
        .data,
    );
    if (n.otherId === void 0) throw new c(`签到详情暂不可用`);
    let r = Number(n.otherId);
    if (Number(n.ifphoto) === 1 || ![0, 4].includes(r))
      return `需要在学习通完成扫码、拍照、手势或签到码验证`;
    if (r === 4 && !t)
      return `需要位置：请用 /location 纬度 经度 地址 设置后等待重试`;
    await this.text(
      o +
        `/newsign/preSign?` +
        new URLSearchParams({
          courseId: e.courseId,
          classId: e.classId,
          activePrimaryId: e.id,
          general: `1`,
          sys: `1`,
          ls: `1`,
          appType: `15`,
          uid: this.cookies._uid,
          ut: `s`,
        }),
    );
    let i = (
      await this.text(
        o + `/pptSign/analysis?vs=1&DB_STRATEGY=RANDOM&aid=` + e.id,
      )
    ).match(/code='\+'([^']+)'/)?.[1];
    (i &&
      (await this.text(
        o +
          `/pptSign/analysis2?` +
          new URLSearchParams({ DB_STRATEGY: `RANDOM`, code: i }),
      )),
      await new Promise((e) => setTimeout(e, 500)));
    let a = new URLSearchParams({
      activeId: e.id,
      uid: this.cookies._uid,
      clientip: ``,
      appType: `15`,
      fid: this.cookies.fid || `0`,
    });
    r === 4 &&
      t &&
      (a.set(`latitude`, String(t.latitude)),
      a.set(`longitude`, String(t.longitude)),
      a.set(`address`, t.address),
      a.set(`ifTiJiao`, `1`));
    let s = (await this.text(o + `/pptSign/stuSignajax?` + a)).trim();
    return s === `success`
      ? `签到成功`
      : /已签到|已经签到/.test(s)
        ? `已签到`
        : `未完成签到，请打开学习通核对（可能需要额外验证）`;
  }
  async signQr(e, t) {
    if (!/^[A-Za-z0-9_-]{8,256}$/.test(t)) throw new c(`二维码内容无效`);
    let n = l(
      (await this.json(o + `/v2/apis/active/getPPTActiveInfo?activeId=` + e.id))
        .data,
    );
    if (Number(n.otherId) !== 2) return `该活动不是二维码签到，未提交`;
    await this.text(
      o +
        `/newsign/preSign?` +
        new URLSearchParams({
          courseId: e.courseId,
          classId: e.classId,
          activePrimaryId: e.id,
          general: `1`,
          sys: `1`,
          ls: `1`,
          appType: `15`,
          uid: this.cookies._uid,
          ut: `s`,
        }),
    );
    let r = new URLSearchParams({
        activeId: e.id,
        uid: this.cookies._uid,
        clientip: ``,
        latitude: `-1`,
        longitude: `-1`,
        appType: `15`,
        fid: this.cookies.fid || `0`,
        enc: t,
      }),
      i = (await this.text(o + `/pptSign/stuSignajax?` + r)).trim();
    return i === `success`
      ? `签到成功`
      : /已签到|已经签到|签到过/.test(i)
        ? `已签到`
        : `二维码签到未完成，请确认二维码仍有效并打开学习通核对`;
  }
};
export { n as a, r as c, T as i, c as n, i as o, w as r, a as s, D as t };
