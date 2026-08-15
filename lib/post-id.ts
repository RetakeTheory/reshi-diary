const POST_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const POST_ID_LENGTH = 10;

export function createPostId() {
  let id = "";

  while (id.length < POST_ID_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte >= 248) continue;
      id += POST_ID_ALPHABET[byte % POST_ID_ALPHABET.length];
      if (id.length === POST_ID_LENGTH) break;
    }
  }

  return id;
}
