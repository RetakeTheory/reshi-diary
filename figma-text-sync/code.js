/* global figma, __html__ */

const TEXT_MAP = Object.freeze({
  "EDIT/home.hero.title": "hero.title",
  "EDIT/home.hero.subtitle": "hero.subtitle",
  "EDIT/home.hero.cta": "hero.cta",
});

const SYNC_ENDPOINT = "http://localhost:3789/figma/sync-text";

figma.showUI(__html__, {
  width: 380,
  height: 520,
  themeColors: true,
  title: "同步网站文字",
});

function scanTextLayers() {
  const editTextNodes = figma.currentPage.findAll(
    (node) => node.type === "TEXT" && node.name.startsWith("EDIT/"),
  );
  const recognizedNodes = editTextNodes.filter((node) => TEXT_MAP[node.name]);
  const nameCounts = recognizedNodes.reduce((counts, node) => {
    counts[node.name] = (counts[node.name] || 0) + 1;
    return counts;
  }, {});
  const duplicates = Object.keys(nameCounts).filter((name) => nameCounts[name] > 1);
  const ignored = editTextNodes
    .filter((node) => !TEXT_MAP[node.name])
    .map((node) => node.name);
  const items = recognizedNodes.map((node) => ({
    field: `home.${TEXT_MAP[node.name]}`,
    layerName: node.name,
    nodeId: node.id,
    value: node.characters,
  }));

  return { duplicates, ignored, items, recognizedCount: recognizedNodes.length };
}

function postScan() {
  figma.ui.postMessage({ type: "scan-result", ...scanTextLayers() });
}

let scanTimer;
function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(postScan, 120);
}

figma.on("documentchange", scheduleScan);
figma.on("currentpagechange", scheduleScan);

figma.ui.onmessage = async (message) => {
  if (message.type === "scan") {
    postScan();
    return;
  }
  if (message.type !== "sync") return;

  const scan = scanTextLayers();
  figma.ui.postMessage({ type: "scan-result", ...scan });

  if (scan.duplicates.length > 0) {
    figma.ui.postMessage({
      type: "sync-status",
      state: "error",
      message: `存在重名图层：${scan.duplicates.join("、")}`,
    });
    return;
  }
  if (scan.items.length === 0) {
    figma.ui.postMessage({
      type: "sync-status",
      state: "error",
      message: "当前页面没有可同步的 EDIT/ Text 图层",
    });
    return;
  }

  const fields = Object.fromEntries(scan.items.map((item) => [item.field, item.value]));
  figma.ui.postMessage({ type: "sync-status", state: "loading", message: "正在构建、提交并推送…" });

  try {
    const response = await fetch(SYNC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `同步服务返回 ${response.status}`);
    }
    figma.ui.postMessage({
      type: "sync-status",
      state: "success",
      message: result.message || "文字已同步到网站",
    });
  } catch (error) {
    figma.ui.postMessage({
      type: "sync-status",
      state: "error",
      message: error instanceof Error ? error.message : "无法连接本地同步服务",
    });
  }
};

postScan();
