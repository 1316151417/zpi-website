import { emptySession } from "@source/ui/reducer.ts";
import type { SessionView } from "@source/ui/types.ts";
import { DESKTOP } from "./shared";

export const COMPLEX = "example-complex";
export const CHILD = "example-complex-explore";
export const CHILD_TASK = "agent_example";
export const BACKGROUND = "terminal_example";
export const exampleLog = "正在检查虚拟页面…\n✓ 窗口布局\n✓ 键盘操作\n等待展示方案确认。";

// A frozen example, not a second runner. No tool in this transcript has side effects.
export function complexView(sid: string): SessionView {
  const view = emptySession(sid, sid === COMPLEX ? "复杂任务" : "检查界面文案");
  const now = Date.now();
  if (sid === CHILD) {
    view.runs = [
      {
        runId: "child-review",
        status: "running",
        userMessage: "检查页面的中英文文案。",
        startedAt: now - 22000,
        finalAnswerBlockIds: [],
        orderedBlocks: [
          { id: "reviewing", messageId: "review", type: "text", text: "正在对照标题、输入提示和按钮文案。" },
        ],
      },
    ];
    return view;
  }
  for (let i = 1; i <= 4; i++) {
    const at = now - (6 - i) * 60000,
      mid = "sample-" + i,
      answer = mid + ":answer";
    view.runs.push({
      runId: mid,
      userMessage: [
        "第一个用户消息：整理当前工作区。",
        "第二个用户消息：检查项目文案。",
        "第三个用户消息：列出待确认项。",
        "第四个用户消息：开始界面检查。",
      ][i - 1],
      startedAt: at,
      endedAt: at + 8000,
      status: "completed",
      finalAnswerBlockIds: [answer],
      orderedBlocks: [
        {
          type: "thinking",
          id: mid + ":plan",
          messageId: mid,
          text: "先确认检查范围，再整理结果。",
          startedAt: at,
          endedAt: at + 1500,
        },
        {
          type: "tool",
          id: mid + ":read",
          toolCallId: mid + ":read",
          messageId: mid,
          name: "read",
          argsText: JSON.stringify({ path: "README.md" }),
          output: "桌面体验检查清单（示例）",
          status: "completed",
        },
        {
          type: "text",
          id: answer,
          messageId: mid + "-final",
          text: [
            "第一个助手回复：已整理工作区，下一步检查文案。",
            "第二个助手回复：标题和按钮文案已分类。",
            "第三个助手回复：还需要确认默认展示语言。",
            "第四个助手回复：我会并行检查布局与文案。",
          ][i - 1],
        },
      ],
    });
  }
  const call = (name: string, key: string, args: unknown, status: "running" | "completed", output = "") => ({
    id: key,
    messageId: key,
    type: "tool" as const,
    toolCallId: key,
    name,
    argsText: JSON.stringify(args),
    status,
    output,
  });
  const questions = [
    {
      header: "展示语言",
      question: "这个页面默认使用哪种语言？",
      multiSelect: false,
      options: [
        { label: "中文", description: "优先展示中文文案。" },
        { label: "中英双语", description: "为两种语言保留并排说明。" },
      ],
    },
  ];
  view.runs.push({
    runId: "sample-current",
    userMessage: "并行验证页面，并在发布前向我确认语言。",
    startedAt: now - 24000,
    status: "running",
    finalAnswerBlockIds: [],
    orderedBlocks: [
      {
        id: "sample-plan",
        messageId: "plan",
        type: "thinking",
        text: "把布局检查和文案检查分开。语言选择留给用户确认。",
        startedAt: now - 24000,
        endedAt: now - 21000,
      },
      {
        id: "sample-note",
        messageId: "note",
        type: "text",
        text: "后台终端正在检查布局，子智能体正在核对文案。还需要你确认一个选项。",
      },
      call(
        "bash",
        "terminal-call",
        { command: "npm run check:layout", description: "验证页面布局", run_in_background: true },
        "completed",
        `后台任务 ${BACKGROUND} 已启动`,
      ),
      call(
        "Agent",
        "agent-call",
        {
          description: "检查界面文案",
          prompt: "核对中英文标题和按钮。",
          subagent_type: "Explore",
          run_in_background: true,
        },
        "completed",
        `子智能体 ${CHILD_TASK} 已启动`,
      ),
      call("AskUserQuestion", "question-call", { questions }, "running"),
    ],
  });
  view.question = { id: "sample-question", questions };
  view.backgroundTasks = [
    {
      taskId: BACKGROUND,
      sessionId: sid,
      toolCallId: "terminal-call",
      description: "验证页面布局",
      command: "npm run check:layout",
      outputPath: DESKTOP + "/layout.log",
      status: "running",
      startedAt: now - 22000,
    },
  ];
  view.subagents = [
    {
      agentId: CHILD_TASK,
      childSessionId: CHILD,
      parentSessionId: sid,
      parentToolCallId: "agent-call",
      spawnToolCallId: "agent-call",
      description: "检查界面文案",
      agentType: "Explore",
      color: "blue",
      background: true,
      status: "running",
      startedAt: now - 22000,
      modelLabel: "GPT-6.2 Astra",
      totalToolUseCount: 3,
      totalTokens: 1420,
      latestActivity: "核对中英文标题与按钮",
    },
  ];
  return view;
}
