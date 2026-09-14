import type { SchoolHttp } from "./dhu-http";

export type DhuSubmitOutcome = "success" | "retry" | "blocked" | "needs_login" | "unknown";
export type DhuSubmitResult = { outcome: DhuSubmitOutcome; message: string };

function schoolText(value: unknown) {
  const text = Array.isArray(value) ? value.map(String).join("；") : String(value ?? "");
  return text.replace(/\s+/g, " ").slice(0, 240);
}

function endpoint(pageUrl: string, name: string) {
  const page = new URL(pageUrl);
  if (page.origin !== "https://webproxy.dhu.edu.cn"
    || !/^\/https\/[a-f0-9]+\/dhu\/selectcourse\/toSH$/i.test(page.pathname)) {
    throw new Error("学校课程页地址无效");
  }
  return new URL(name, page).href;
}

export async function submitDhuCourse(school: SchoolHttp, pageUrl: string,
  sectionNumber: string, buyMaterial: boolean): Promise<DhuSubmitResult> {
  if (!/^\d{6,12}$/.test(sectionNumber) || typeof buyMaterial !== "boolean") {
    throw new Error("选课参数无效");
  }
  const conflict = await school.postForm(endpoint(pageUrl, "scConflictCheck"),
    { cttId: sectionNumber }, pageUrl);
  if (conflict.success !== true) {
    return { outcome: "blocked", message: schoolText(conflict.msg) || "学校提示课程冲突，需本人确认" };
  }
  const result = await school.postForm(endpoint(pageUrl, "scSubmit"), {
    cttId: sectionNumber, needMaterial: String(buyMaterial), capCode: "",
  }, pageUrl);
  if (result.success === true) {
    return result.msg === "F"
      ? { outcome: "blocked", message: "学校要求图形验证码，请本人在学校页面完成" }
      : { outcome: "success", message: "学校返回选课成功" };
  }
  const message = schoolText(result.msg) || schoolText(result.warnMsg) || "学校未接受选课申请";
  if (/登录|会话|认证/.test(message)) return { outcome: "needs_login", message };
  if (/验证码|图形|冲突|不允许|已选|重复/.test(message)) return { outcome: "blocked", message };
  if (/未到|未开放|尚未|已满|额满|人数|名额/.test(message)) return { outcome: "retry", message };
  return { outcome: "unknown", message };
}
