const FORWARDED_HEADERS = ["accept", "content-type", "cookie", "user-agent"] as const;
// Keep this in sync with the mainland backend's exact-host allowlist. Other
// Chaoxing hosts must use the ordinary channel until that backend is updated.
const RELAY_HOSTS = new Set([
  "mobilelearn.chaoxing.com",
  "mooc1-1.chaoxing.com",
  "passport2-api.chaoxing.com",
  "passport2.chaoxing.com",
]);

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
    const target = new URL(source.url);
    if (target.protocol !== "https:" || !RELAY_HOSTS.has(target.hostname.toLowerCase())) {
      return directFetch(input, init);
    }
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

    try {
      const response = await directFetch(new URL("/internal/chaoxing-relay", relayOrigin), {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : init?.body ?? source.body,
        redirect: "manual",
        signal: init?.signal,
      });
      if (response.status < 500 && response.status !== 401 && response.status !== 403) return response;
      const status = response.status;
      await response.body?.cancel();
      console.warn(JSON.stringify({ event: "chaoxing_relay_failed", host: target.hostname, method, status }));
      if (method === "GET") {
        try { return await directFetch(input, init); } catch { /* preserve relay failure below */ }
      }
      const error = new Error(`Chaoxing relay returned HTTP ${status}`);
      error.name = "ChaoxingRelayError";
      throw error;
    } catch (error) {
      if (!(error instanceof Error && error.name === "ChaoxingRelayError")) {
        console.warn(JSON.stringify({ event: "chaoxing_relay_failed", host: target.hostname, method,
          reason: error instanceof Error ? error.name : "unknown" }));
        if (method === "GET") {
          try { return await directFetch(input, init); } catch { /* preserve relay failure below */ }
        }
      }
      const failure = new Error("Chaoxing relay request failed");
      failure.name = error instanceof Error && /timeout/i.test(`${error.name} ${error.message}`)
        ? "ChaoxingRelayTimeoutError" : "ChaoxingRelayError";
      throw failure;
    }
  };
}
