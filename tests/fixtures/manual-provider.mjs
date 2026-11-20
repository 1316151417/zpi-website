// Offline transport for running the reader's unmodified .mts files against the package entry points.
import assert from "node:assert/strict";
import { Socket } from "node:net";

Socket.prototype.connect = () => {
  throw Error("Manual examples must not open a network connection");
};
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  assert.equal(new URL(request.url).origin, "https://api.deepseek.com");
  assert.equal(request.method, "POST");
  const body = await request.json();
  if (process.env.FIXTURE_FAILURE) {
    return Response.json(
      { type: "error", error: { type: "authentication_error", message: "fixture denied" } },
      { status: 401 },
    );
  }
  const names = (body.tools ?? []).map((t) => t.name);
  const history = JSON.stringify(body.messages);
  const doneTool = body.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result"),
  );
  if (process.env.FIXTURE_NO_REQUEST) throw Error("Metadata-only example sent a model request");
  if (process.env.FIXTURE_HOOK)
    assert.ok(history.includes("使用短句作答。") || JSON.stringify(body.system).includes("使用短句作答。"));
  if (process.env.FIXTURE_PLUGIN) assert.ok(history.includes("向 小周 问候"));
  let name,
    args,
    answer = process.env.FIXTURE_JSON ? '{"kind":"bug"}' : "离线回复";
  if (names.includes("lookup_order") && !process.env.FIXTURE_SKIP_TOOL) {
    name = "lookup_order";
    args = { id: history.includes("订单 99") ? "99" : "42" };
    answer = history.includes("未找到") ? "订单未找到" : "订单已发货";
  } else if (names.includes("Write") && process.env.FIXTURE_WRITE) {
    name = "Write";
    args = { file_path: "note.txt", content: "after" };
  } else if (names.includes("Agent")) {
    name = "Agent";
    args = { description: "核对算式", prompt: "7 乘以 6 是多少？", subagent_type: "checker" };
  } else if (names.includes("Skill")) {
    name = "Skill";
    args = { skill: "triage" };
  }
  const call = !!name && !doneTool;
  const events = [
    {
      type: "message_start",
      message: {
        id: "m1",
        type: "message",
        role: "assistant",
        model: body.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 6, output_tokens: 0 },
      },
    },
    {
      type: "content_block_start",
      index: 0,
      content_block: call
        ? { type: "tool_use", id: "sample-call", name, input: {} }
        : { type: "text", text: "" },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: call
        ? { type: "input_json_delta", partial_json: JSON.stringify(args) }
        : {
            type: "text_delta",
            text: answer,
          },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: call ? "tool_use" : "end_turn", stop_sequence: null },
      usage: { output_tokens: 4 },
    },
    { type: "message_stop" },
  ];
  return new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
};
