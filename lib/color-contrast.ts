export function readableTextColor(background: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 16);
  const channels = [value >> 16 & 255, value >> 8 & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.42 ? "#181927" : "#ffffff";
}
