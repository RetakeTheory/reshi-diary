export type FoodRankingType = "red" | "black";
export type FoodRankingVote = "up" | "down";
export type FoodRankingEntry = {
  id: string;
  listType: FoodRankingType;
  restaurant: string;
  location: string;
  category: string;
  summary: string;
  details: string;
  tags: string[];
  imageUrl: string;
  likes: number;
  dislikes: number;
  myVote: FoodRankingVote | null;
  createdAt: number;
  updatedAt: number;
};

function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export function normalizeFoodRankingInput(raw: unknown) {
  if (!raw || typeof raw !== "object") throw new Error("榜单内容无效");
  const input = raw as Partial<FoodRankingEntry> & { tags?: unknown };
  const listType: FoodRankingType = input.listType === "black" ? "black" : "red";
  const restaurant = text(input.restaurant, 100);
  const location = text(input.location, 120);
  const category = text(input.category, 60);
  const summary = text(input.summary, 300);
  const details = text(input.details, 4000);
  const imageUrl = text(input.imageUrl, 2000);
  const tags = Array.isArray(input.tags) ? [...new Set(input.tags.map((item) => text(item, 30)).filter(Boolean))].slice(0, 12) : [];
  if (!restaurant || !summary) throw new Error("请填写餐厅名称和榜单摘要");
  if (imageUrl && !/^\/api\/files\/uploads\/[A-Za-z0-9%._~-]+$/.test(imageUrl)) throw new Error("饭菜照片地址无效，请重新上传");
  return { listType, restaurant, location, category, summary, details, tags, imageUrl };
}

export function foodRankingFromRow(row: Record<string, unknown>): FoodRankingEntry {
  return {
    id: String(row.id), listType: row.listType === "black" ? "black" : "red", restaurant: String(row.restaurant),
    location: String(row.location || ""), category: String(row.category || ""), summary: String(row.summary), details: String(row.details || ""),
    tags: JSON.parse(String(row.tagsJson || "[]")) as string[], imageUrl: String(row.imageUrl || ""), likes: Number(row.likes || 0), dislikes: Number(row.dislikes || 0), myVote: row.myVote === "up" || row.myVote === "down" ? row.myVote : null, createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt),
  };
}

export const foodRankingSelect = `SELECT id, list_type AS listType, restaurant, location, category, summary, details, tags_json AS tagsJson, image_url AS imageUrl, created_at AS createdAt, updated_at AS updatedAt FROM food_rankings`;
