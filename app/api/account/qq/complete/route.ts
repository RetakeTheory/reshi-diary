import { forwardRustApi } from "../../../../../lib/rust-api-route";

export async function POST(request: Request) {
  return forwardRustApi(request);
}
