// Protocol adapted from cxOrz/chaoxing-signin (MIT); see docs/chaoxing-third-party.txt.
export type CxLocation = { latitude: number; longitude: number; address: string };
export type CxCourse = { courseId: string; classId: string };
export type CxActivity = CxCourse & { id: string; name: string; otherId: number };
export type CxSession = { cookies: Record<string, string>; courses: CxCourse[] };
const MOBILE = "https://mobilelearn.chaoxing.com";
const UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36";
export class CxError extends Error {}
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const id = (v: unknown) => /^\d+$/.test(String(v)) ? String(v) : "";
export function parseLocation(text: string): CxLocation | null {
  const match = text.match(/^\/location\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(.{1,160})$/u);
  if (!match) return null;
  const latitude = Number(match[1]), longitude = Number(match[2]), address = match[3].trim();
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && address ? { latitude, longitude, address } : null;
}
export function parseRegistration(text: string) {
  const match = text.match(/^\/register(?:\+|\s+)(1\d{10})(?:\+|\s)([^\r\n]{1,128})$/);
  return match ? { phone: match[1], password: match[2] } : null;
}
export function parseActivities(value: unknown, course: CxCourse): CxActivity[] {
  const data = obj(obj(value).data);
  if (!Array.isArray(data.activeList)) throw new CxError("学习通活动接口暂不可用，请稍后重试");
  return data.activeList.flatMap((value) => {
    const item = obj(value), activityId = id(item.id), otherId = Number(item.otherId);
    return activityId && Number(item.status) === 1 && [0, 2, 3, 4, 5].includes(otherId)
      ? [{ ...course, id: activityId, name: String(item.nameOne || "课程签到").slice(0, 60), otherId }] : [];
  });
}
export class ChaoxingClient {
  cookies: Record<string, string>;
  private request: typeof fetch;
  constructor(cookies: Record<string, string> = {}, request: typeof fetch = fetch) {
    this.cookies = { ...cookies }; this.request = request;
  }
  private async text(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", UA);
    const cookie = Object.entries(this.cookies).map(([k,v]) => k + "=" + v).join("; ");
    if (cookie) headers.set("Cookie", cookie);
    let response: Response;
    try { response = await this.request(url, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(8000) }); }
    catch { throw new CxError("学习通网络连接失败，请稍后重试"); }
    if (response.status >= 300 && response.status < 400 || response.status === 401) throw new CxError("登录已失效，请重新 /register");
    if (!response.ok) throw new CxError("学习通服务暂不可用，请稍后重试");
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(";", 1)[0], index = pair.indexOf("=");
      if (index > 0) this.cookies[pair.slice(0,index)] = pair.slice(index+1);
    }
    const value = await response.text();
    if (value.length > 2_000_000) throw new CxError("学习通响应异常");
    return value;
  }
  private async json(url: string, init: RequestInit = {}) {
    const text = await this.text(url, init);
    try { return obj(JSON.parse(text)); } catch { throw new CxError("学习通接口返回异常，请检查登录状态"); }
  }
  async login(phone: string, password: string): Promise<CxSession> {
    // Current web login uses AES-CBC; this protocol key is public, not a storage encryption key.
    const bytes = new TextEncoder().encode("u2oh6Vu^HWe4_AES");
    const key = await crypto.subtle.importKey("raw", bytes, "AES-CBC", false, ["encrypt"]);
    const encode = async (text: string) => {
      const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: bytes }, key, new TextEncoder().encode(text)));
      return btoa(String.fromCharCode(...encrypted));
    };
    const body = new URLSearchParams({ fid: "-1", uname: await encode(phone), password: await encode(password),
      refer: "https%3A%2F%2Fi.chaoxing.com", t: "true", forbidotherlogin: "0", validate: "", doubleFactorLogin: "0" });
    const value = await this.json("https://passport2.chaoxing.com/fanyalogin", { method: "POST", body });
    if (value.status !== true || !id(this.cookies._uid)) throw new CxError("登录失败，请核对账号密码；如需验证码，请先在学习通完成验证");
    return { cookies: this.cookies, courses: await this.courses() };
  }
  async courses(): Promise<CxCourse[]> {
    const html = await this.text("https://mooc1-1.chaoxing.com/visit/courselistdata", {
      method: "POST", body: new URLSearchParams({ courseType: "1", courseFolderId: "0", courseFolderSize: "0" }) });
    if (/passport2\.chaoxing\.com|name=["']password/i.test(html)) throw new CxError("登录已失效，请重新 /register");
    const courses = new Map<string,CxCourse>();
    for (const match of html.matchAll(/course_(\d+)_(\d+)["']/g)) courses.set(match[0], { courseId: match[1], classId: match[2] });
    if (!courses.size && !/暂无|没有|course|课程/i.test(html)) throw new CxError("课程接口返回异常");
    return [...courses.values()];
  }
  async activities(course: CxCourse) {
    return parseActivities(await this.json(MOBILE + "/v2/apis/active/student/activelist?" + new URLSearchParams({ ...course, fid: "0", showNotStartedActive: "0", _: String(Date.now()) })), course);
  }
  async sign(activity: CxActivity, location?: CxLocation): Promise<string> {
    const detail = obj((await this.json(MOBILE + "/v2/apis/active/getPPTActiveInfo?activeId=" + activity.id)).data);
    if (detail.otherId === undefined) throw new CxError("签到详情暂不可用");
    const kind = Number(detail.otherId);
    if (Number(detail.ifphoto) === 1 || ![0,4].includes(kind)) return "需要在学习通完成扫码、拍照、手势或签到码验证";
    if (kind === 4 && !location) return "需要位置：请用 /location 纬度 经度 地址 设置后等待重试";
    await this.text(MOBILE + "/newsign/preSign?" + new URLSearchParams({ courseId: activity.courseId, classId: activity.classId,
      activePrimaryId: activity.id, general: "1", sys: "1", ls: "1", appType: "15", uid: this.cookies._uid, ut: "s" }));
    const analysis = await this.text(MOBILE + "/pptSign/analysis?vs=1&DB_STRATEGY=RANDOM&aid=" + activity.id);
    const code = analysis.match(/code='\+'([^']+)'/)?.[1];
    if (code) await this.text(MOBILE + "/pptSign/analysis2?" + new URLSearchParams({ DB_STRATEGY: "RANDOM", code }));
    await new Promise(resolve => setTimeout(resolve, 500));
    const params = new URLSearchParams({ activeId: activity.id, uid: this.cookies._uid, clientip: "", appType: "15", fid: this.cookies.fid || "0" });
    if (kind === 4 && location) {
      params.set("latitude", String(location.latitude)); params.set("longitude", String(location.longitude));
      params.set("address", location.address); params.set("ifTiJiao", "1");
    }
    const result = (await this.text(MOBILE + "/pptSign/stuSignajax?" + params)).trim();
    if (result === "success") return "签到成功";
    if (/已签到|已经签到/.test(result)) return "已签到";
    // Never forward upstream HTML or credential-bearing error text to QQ or logs.
    return "未完成签到，请打开学习通核对（可能需要额外验证）";
  }
}
