import type { Metadata } from "next";

export const SITE_URL = "https://rettheory.top/";
export const SITE_NAME = "Reshi_Official";
export const DEFAULT_DESCRIPTION = "今天该玩点什么呢";
export const OG_IMAGE_URL = `${SITE_URL}og-reshi-avatar.png`;

const image = {
  url: OG_IMAGE_URL,
  width: 478,
  height: 478,
  alt: "站郎 Q 版头像",
};

export function createOpenGraph(
  title = SITE_NAME,
  description = DEFAULT_DESCRIPTION,
  url = SITE_URL,
): NonNullable<Metadata["openGraph"]> {
  return {
    title,
    description,
    url,
    siteName: SITE_NAME,
    type: "website",
    images: [image],
  };
}

export function createTwitterCard(
  title = SITE_NAME,
  description = DEFAULT_DESCRIPTION,
): NonNullable<Metadata["twitter"]> {
  return {
    card: "summary",
    title,
    description,
    images: [image],
  };
}
