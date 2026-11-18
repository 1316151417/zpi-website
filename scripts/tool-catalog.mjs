// Build-time metadata only. Never execute a tool, start a process, or contact a provider.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const source = (path) => import(pathToFileURL(resolve(process.cwd(), "packages", path)).href);
const [{ createCodingTools }, { UserQuestions }, { SubagentPlugin }, { TaskControls }, { WebTools }] =
  await Promise.all([
    source("coding-agent/src/core/tools/index.ts"),
    source("builtin-plugins/src/questions.ts"),
    source("builtin-plugins/src/collaboration/runtime.ts"),
    source("builtin-plugins/src/tasks/controls.ts"),
    source("builtin-plugins/src/web/tools.ts"),
  ]);
const tools = [
  ...createCodingTools("/Users/demo/Desktop"),
  new UserQuestions(() => {}).tool("preview"),
  ...new SubagentPlugin({}, {}).tools("preview"),
  ...new TaskControls([]).tools("preview"),
  ...new WebTools({}).tools(),
];
process.stdout.write(
  JSON.stringify(
    tools.map(({ name, description, parameters, promptSnippet, promptGuidelines }) => ({
      name,
      description,
      parameters,
      promptSnippet,
      promptGuidelines,
    })),
  ),
);
