// Offline transport for running the reader's unmodified .mts files against the package entry points.
import assert from "node:assert/strict";
import { Socket } from "node:net";

Socket.prototype.connect = () => { throw Error("Manual examples must not open a network connection"); };
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  assert.equal(new URL(request.url).origin, "https://api.deepseek.com");
  assert.equal(request.method, "POST");
  const body = await request.json();
  if (process.env.FIXTURE_FAILURE) {
    return Response.json({ type: "error", error: { type: "authentication_error", message: "fixture denied" } }, { status: 401 });
  }
  const order = body.tools?.some((t) => t.name === "lookup_order");
  const hasOrder = JSON.stringify(body.messages).includes("已发货");
  const call = order && !hasOrder;
  const events = [
    { type: "message_start", message: { id: "m1", type: "message", role: "assistant", model: body.model, content: [],
      stop_reason: null, stop_sequence: null, usage: { input_tokens: 6, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: call ? { type: "tool_use", id: "order-call", name: "lookup_order", input: {} } : { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: call ? { type: "input_json_delta", partial_json: '{"id":"42"}' } : { type: "text_delta", text: order ? "订单已发货" : "离线回复" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: call ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 4 } },
    { type: "message_stop" },
  ];
  return new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
};
