type Payload = Record<string, unknown>;
export async function sendOneBotReply(call: (action: string, params: Payload) => Promise<Payload>, target: "private" | "group", id: string,
  text: string, render?: () => Promise<ArrayBuffer>) {
  const send = async (message: unknown[]) => {
    const result = await call(target === "group" ? "send_group_msg" : "send_private_msg", {
      [target === "group" ? "group_id" : "user_id"]: Number(id), message,
    });
    if (result.status !== "ok" || Number(result.retcode) !== 0) throw new Error("QQ 消息发送失败");
  };
  if (render) {
    try {
      const image = await render();
      await send([{ type: "image", data: { file: "base64://" + Buffer.from(image).toString("base64") } }]);
      return;
    } catch { /* Image rendering or sending failed; retain a readable result. */ }
  }
  await send([{ type: "text", data: { text } }]);
}
