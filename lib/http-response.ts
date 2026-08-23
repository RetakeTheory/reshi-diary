export async function readJsonOrEmpty<T extends object>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) return {} as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(response.ok ? "服务器返回异常，请稍后重试" : `请求失败（${response.status}）`);
  }
}
