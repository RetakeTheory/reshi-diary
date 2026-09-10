const FORWARDED_HEADERS = ["accept", "content-type", "cookie", "user-agent"] as const;

type RelayEnv = {
  CHAOXING_RELAY_ORIGIN?: string;
  CHAOXING_RELAY_TOKEN?: string;
};

export function createChaoxingFetch(env: RelayEnv, directFetch: typeof fetch = fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const relayOrigin = env.CHAOXING_RELAY_ORIGIN?.trim();
    const relayToken = env.CHAOXING_RELAY_TOKEN?.trim();
    if (!relayOrigin || !relayToken) return directFetch(input, init);

    const source = input instanceof Request ? input : new Request(input, init);
    const method = (init?.method || source.method || "GET").toUpperCase();
    const sourceHeaders = new Headers(source.headers);
    if (init?.headers) new Headers(init.headers).forEach((value, name) => sourceHeaders.set(name, value));
    const headers = new Headers({
      authorization: `Bearer ${relayToken}`,
      "x-chaoxing-target": source.url,
    });
    for (const name of FORWARDED_HEADERS) {
      const value = sourceHeaders.get(name);
      if (value) headers.set(name, value);
    }

    return directFetch(new URL("/internal/chaoxing-relay", relayOrigin), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : init?.body ?? source.body,
      redirect: "manual",
      signal: init?.signal,
    });
  };
}
