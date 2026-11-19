import type { ToolCall, ToolOptions } from "@source/quick/types.ts";
import { core, files, DESKTOP, snake, id } from "./shared";

const repo = "https://github.com/1316151417/zpi";
const description = "ZPI 是一个桌面 Agent 工作区，可以在同一任务中对话、查看文件、运行终端并预览结果。";
const source = { title: "1316151417/zpi · GitHub", url: repo, siteName: "GitHub", excerpt: description };
const name = "ZPI 项目卡片";
const sentence = "Small tools can make a big difference.";
type Output = { text(value: string): void; call(value: ToolCall): void; offset(): number };
type Step = (out: Output) => void;
export function scenario(tools: ToolOptions): { prompt: string; steps: Step[] } {
  const search: Step = (out) =>
    out.call({
      id: id("search"),
      name: "web_search",
      input: "site:github.com 1316151417 zpi",
      offset: out.offset(),
      output: source.title,
      sources: [source],
    });
  if (tools.web && tools.bash) {
    return {
      prompt: "帮我做一张 ZPI 的双语项目卡片，放在桌面上。",
      steps: [
        (out) => out.text("先找到项目，再把中英文简介整理成一张离线卡片。\n\n"),
        search,
        (out) => {
          let filename = name + ".md";
          for (let n = 2; files.stat(DESKTOP + "/" + filename); n++) filename = `${name} ${n}.md`;
          const content = `# ZPI · Project card\n\n中文｜${description}\n\nEnglish｜ZPI is a desktop agent workspace for conversations, files, terminal commands and live previews.\n\nGitHub｜${repo}\n`;
          files.write(DESKTOP + "/" + filename, content);
          out.call({
            id: id("save"),
            name: "Bash",
            input: `写入 ~/Desktop/${filename}`,
            offset: out.offset(),
            output: content,
          });
          out.text(`已保存到桌面：**${filename}**。\n\n[GitHub 仓库](${repo})`);
        },
      ],
    };
  }
  if (tools.web)
    return {
      prompt: "在 GitHub 上找到 ZPI，给我链接和一句介绍。",
      steps: [
        (out) => out.text("查看 GitHub 项目来源。\n\n"),
        search,
        (out) => out.text(`[**1316151417/zpi**](${repo})\n\n${description}`),
      ],
    };
  if (tools.bash)
    return {
      prompt: "清理桌面上刚生成的贪吃蛇 HTML。",
      steps: [
        (out) => out.text("只检查桌面的 snake.html，不动其他文件。\n\n"),
        (out) => {
          const path = DESKTOP + "/snake.html",
            node = files.stat(path);
          const generated = node?.type === "file" && node.content === snake;
          const result = generated
            ? "已清理：snake.html 已从桌面移除。"
            : node
              ? "同名文件内容不同，已保留。"
              : "桌面没有 snake.html，无需清理。";
          if (generated) files.remove(path);
          out.call({
            id: id("clean"),
            name: "Bash",
            input: generated ? "rm ~/Desktop/snake.html" : "ls ~/Desktop",
            offset: out.offset(),
            output: result,
          });
          out.text(result);
        },
      ],
    };
  return {
    prompt: `把这句英文翻译成中文：${sentence}`,
    steps: [
      (out) => out.text(`**原文**\n${sentence}\n\n`),
      (out) => out.text("**译文**\n小工具也能带来大改变。"),
    ],
  };
}
