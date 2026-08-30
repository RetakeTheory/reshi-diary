import sitePagesJson from "../src/content/site-pages.json";

export type ModuleStyles = {
  spacing: "default" | "compact" | "airy";
  align: "inherit" | "left" | "center";
  width: "default" | "narrow" | "wide";
};

export type SiteModule = {
  id: string;
  type: string;
  label: string;
  hidden: boolean;
  canMove: boolean;
  canHide: boolean;
  fields: Record<string, string>;
  styles: ModuleStyles;
};

export type SitePage = {
  label: string;
  path: string;
  modules: SiteModule[];
};

export type SitePagesDocument = {
  schemaVersion: 1;
  globals: { navigation: Record<string, string> };
  pages: Record<string, SitePage>;
};

export const sitePages = sitePagesJson as unknown as SitePagesDocument;

const styleOptions = {
  spacing: new Set<ModuleStyles["spacing"]>(["default", "compact", "airy"]),
  align: new Set<ModuleStyles["align"]>(["inherit", "left", "center"]),
  width: new Set<ModuleStyles["width"]>(["default", "narrow", "wide"]),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: unknown, baseline: Record<string, unknown>, label: string) {
  if (!isRecord(value)) throw new Error(`${label} 必须是对象`);
  const actual = Object.keys(value).sort();
  const expected = Object.keys(baseline).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} 的字段结构已改变，请刷新编辑器后重试`);
  }
}

function safeLink(value: string) {
  return value.startsWith("/") && !value.startsWith("//")
    || value.startsWith("#")
    || value.startsWith("mailto:")
    || value.startsWith("https://");
}

function validateTextFields(value: unknown, baseline: Record<string, string>, label: string) {
  exactKeys(value, baseline, label);
  const fields = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(baseline).map((key) => {
    const field = fields[key];
    if (typeof field !== "string") throw new Error(`${label}.${key} 必须是文字`);
    if (field.length > 5000) throw new Error(`${label}.${key} 最多 5000 个字符`);
    if (baseline[key].trim() && !field.trim()) throw new Error(`${label}.${key} 不能为空`);
    if (key.toLowerCase().includes("href") && !safeLink(field)) throw new Error(`${label}.${key} 只能使用站内路径、HTTPS、邮箱或页内锚点`);
    return [key, field];
  }));
}

export function validateSitePagesDocument(candidate: unknown, baseline: SitePagesDocument = sitePages): SitePagesDocument {
  if (!isRecord(candidate) || candidate.schemaVersion !== 1 || !isRecord(candidate.pages) || !isRecord(candidate.globals)) {
    throw new Error("不支持的页面配置版本");
  }
  exactKeys(candidate.pages, baseline.pages, "页面列表");
  exactKeys(candidate.globals, baseline.globals, "全局配置");
  const navigation = (candidate.globals as Record<string, unknown>).navigation;
  const next = structuredClone(baseline);
  next.globals.navigation = validateTextFields(navigation, baseline.globals.navigation, "全局导航");

  for (const pageId of Object.keys(baseline.pages)) {
    const page = candidate.pages[pageId];
    const originalPage = baseline.pages[pageId];
    if (!isRecord(page) || page.label !== originalPage.label || page.path !== originalPage.path || !Array.isArray(page.modules)) throw new Error(`页面 ${pageId} 的固定信息已改变`);
    if (page.modules.length !== originalPage.modules.length) throw new Error(`页面 ${pageId} 的模块数量已改变`);
    const originalById = new Map(originalPage.modules.map((module) => [module.id, module]));
    const seen = new Set<string>();
    next.pages[pageId].modules = page.modules.map((module, index) => {
      if (!isRecord(module) || typeof module.id !== "string" || seen.has(module.id)) throw new Error(`页面 ${pageId} 含有无效或重复模块`);
      seen.add(module.id);
      const original = originalById.get(module.id);
      if (!original) throw new Error(`页面 ${pageId} 含有未知模块 ${module.id}`);
      if (module.type !== original.type || module.label !== original.label || module.canMove !== original.canMove || module.canHide !== original.canHide) throw new Error(`模块 ${module.id} 的固定信息已改变`);
      if (!original.canMove && originalPage.modules[index]?.id !== module.id) throw new Error(`模块 ${module.label} 已锁定，不能移动`);
      if (typeof module.hidden !== "boolean" || !original.canHide && module.hidden) throw new Error(`模块 ${module.label} 不能隐藏`);
      exactKeys(module.styles, original.styles, `模块 ${module.label} 的布局`);
      const styles = module.styles as Record<string, unknown>;
      for (const [key, options] of Object.entries(styleOptions)) if (!options.has(styles[key] as never)) throw new Error(`模块 ${module.label} 的 ${key} 布局值无效`);
      return {
        ...original,
        hidden: module.hidden,
        fields: validateTextFields(module.fields, original.fields, `模块 ${module.label}`),
        styles: styles as ModuleStyles,
      };
    });
  }
  return next;
}

export function pageDocument(pageId: string) {
  const page = sitePages.pages[pageId];
  if (!page) throw new Error(`Unknown editable page: ${pageId}`);
  return page;
}

export function pageModule(pageId: string, moduleId: string) {
  const editableModule = pageDocument(pageId).modules.find((item) => item.id === moduleId);
  if (!editableModule) throw new Error(`Unknown editable module: ${pageId}/${moduleId}`);
  return editableModule;
}

export function splitDisplayText(value: string) {
  const [lead, ...rest] = value.split("\n");
  return { lead, accent: rest.join("\n") };
}
