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

export const sitePages = sitePagesJson as SitePagesDocument;

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
