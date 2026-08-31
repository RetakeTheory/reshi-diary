import { forwardRustApi } from "../../../../lib/rust-api-route";

export async function GET(request: Request) {
  return forwardRustApi(request);
}

export async function POST(request: Request) {
  return forwardRustApi(request);
}

export async function DELETE(request: Request) {
  return forwardRustApi(request);
}
