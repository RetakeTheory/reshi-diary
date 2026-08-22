import { rustBackendFetch } from "../lib/rust-backend";
import NoticeTicker from "./NoticeTicker";

type Notice = { id: number; text: string; backgroundColor: string; foregroundColor: string };

async function loadNotice(): Promise<Notice | null> {
  try {
    const response = await rustBackendFetch("/api/notifications/active");
    if (!response?.ok) return null;
    return ((await response.json()) as { notification: Notice | null }).notification;
  } catch {
    return null;
  }
}

export default async function NoticeBanner() {
  const notice = await loadNotice();
  if (!notice) return null;
  return <NoticeTicker notice={notice} />;
}
