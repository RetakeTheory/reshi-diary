interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

type DurableObjectStub = Fetcher;

interface DurableObjectNamespace {
  getByName(name: string): DurableObjectStub;
}

interface DurableObjectState {
  acceptWebSocket(socket: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

interface WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown | null;
}

interface ResponseInit {
  webSocket?: WebSocket;
}

declare namespace Cloudflare {
  interface Env {
    ASSETS?: Fetcher;
    IMAGES?: {
      input(stream: ReadableStream): {
        transform(options: Record<string, unknown>): {
          output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
        };
      };
    };
    AWS_SESSION_TOKEN?: string;
    RESEND_FROM?: string;
    ADMIN_EMAIL?: string;
    GITHUB_REPOSITORY?: string;
    RUST_BACKEND_ORIGIN?: string;
  }
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
  export abstract class DurableObject<WorkerEnv = Cloudflare.Env> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: WorkerEnv;
    constructor(ctx: DurableObjectState, env: WorkerEnv);
  }
}
