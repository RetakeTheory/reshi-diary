export async function getFilesBucket() {
  const { env } = await import("cloudflare:workers");
  if (!env.FILES) throw new Error("File storage binding FILES is unavailable");
  return env.FILES;
}
