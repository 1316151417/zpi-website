import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const zpi = resolve(process.env.ZPI_SOURCE || join(root, "../zpi"));
const quick = resolve(process.env.QUICK_CHAT_SOURCE || join(root, "../zpi-quick-chat"));
const dir = await mkdtemp(join(tmpdir(), "zpi-manual-examples-"));
const modules = join(dir, "node_modules");
const pkg = async (path) => JSON.parse(await readFile(join(path, "package.json"), "utf8"));
const env = { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, DEEPSEEK_API_KEY: "offline-example" };
function run(args, { environment = env, status = 0, match } = {}) {
  const result = spawnSync(process.execPath, args, { cwd: dir, env: environment, encoding: "utf8", timeout: 30000 });
  const text = result.stdout + result.stderr;
  if (result.error) throw result.error;
  assert.equal(result.status, status, `${args.join(" ")}\n${text}`);
  if (match) assert.match(text, match);
  return text;
}

try {
  const sdk = join(zpi, "packages/agent-sdk");
  const manifest = await pkg(sdk);
  const target = join(modules, manifest.name);
  await mkdir(target, { recursive: true });
  await cp(join(sdk, "dist"), join(target, "dist"), { recursive: true });
  await cp(join(sdk, "package.json"), join(target, "package.json"));
  // This consumer has only the distributable SDK and its public dependencies, not the monorepo aliases.
  await mkdir(join(modules, "@types"), { recursive: true });
  for (const dep of [...Object.keys(manifest.dependencies), "@types/node"]) {
    await mkdir(dirname(join(modules, dep)), { recursive: true });
    await symlink(join(zpi, "node_modules", dep), join(modules, dep), "dir");
  }
  // Check the printed setup commands without starting a GUI, installing npm packages or asking for a key.
  const tutorial = await readFile(join(root, "manuals/zpi/tutorial/first-edit.md"), "utf8");
  const practiceSetup = /^```sh\n([\s\S]*?)^```$/m.exec(tutorial)[1];
  const practice = spawnSync("sh", ["-ec", `open() { test -f "$1/note.txt"; }; ${practiceSetup}\nprintf '%s' "$practice"`], {
    cwd: dir, env, encoding: "utf8",
  });
  assert.equal(practice.status, 0, practice.stderr);
  assert.equal(await readFile(join(practice.stdout, "note.txt"), "utf8"), "状态：未开始\n保留：蓝色\n");
  const quickSetup = await readFile(join(root, "manuals/zpi-quick-chat/reference/setup.md"), "utf8");
  const syntax = spawnSync("zsh", ["-n"], { input: /^```zsh\n([\s\S]*?)^```$/m.exec(quickSetup)[1], env });
  if (syntax.error?.code !== "ENOENT") assert.equal(syntax.status, 0, String(syntax.stderr));

  const files = [];
  for (const [article, file] of [
    ["tutorial/first-query", "first-query"], ["how-to/stream", "stream"], ["how-to/custom-tool", "order"],
    ["how-to/resume", "branch"], ["reference/host", "host"],
  ]) {
    const source = await readFile(join(root, `manuals/zpi-agent-sdk/${article}.md`), "utf8");
    const blocks = [...source.matchAll(/^```ts\n([\s\S]*?)^```$/gm)];
    assert.equal(blocks.length, 1, article);
    const name = `${file}.mts`;
    await writeFile(join(dir, name), blocks[0][1]);
    files.push(name);
  }
  run([join(zpi, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2023", "--module", "NodeNext", "--types", "node", ...files]);
  const mock = ["--import", join(root, "tests/fixtures/manual-provider.mjs")];
  run([...mock, "first-query.mts"], { match: /成功： 离线回复/ });
  run([...mock, "first-query.mts"], { environment: { ...env, FIXTURE_FAILURE: "1" }, status: 1, match: /失败： error_during_execution/ });
  run([...mock, "first-query.mts"], { environment: { ...env, DEEPSEEK_API_KEY: "" }, status: 1, match: /查询异常： Model is not configured/ });
  run([...mock, "order.mts"], { match: /模型调用了工具 订单已发货/ });
  run([...mock, "branch.mts"], { match: /离线回复/ });
  await writeFile(join(dir, "controls.mts"), `
    import assert from 'node:assert/strict';
    import { ModelRuntime, listSessions } from '@zpi-dev/agent-sdk';
    import { createAgentSession, SessionManager, SettingsManager, queryResult } from '@zpi-dev/agent-sdk/host';
    import { askInHost } from './host.mts';
    import { showTurn } from './stream.mts';
    const options = { model: 'deepseek', tools: [], persistSession: false };
    assert.equal(await showTurn('你好', options), '离线回复');
    process.env.FIXTURE_FAILURE = '1';
    await assert.rejects(queryResult({prompt: '你好', options}), e => e.sdkResult?.subtype === 'error_during_execution');
    delete process.env.FIXTURE_FAILURE;
    const rows = await listSessions({dir: process.cwd(), zpi: {agentDir: '.practice-sdk'}});
    assert.equal(new Set(rows.map(r => r.sessionId)).size, 2);
    await assert.rejects(queryResult({prompt: (async function*(){})(), options}), /no result/);
    const runtime = await ModelRuntime.create();
    runtime.registerProvider('practice', { api: 'anthropic-messages', baseUrl: 'https://api.deepseek.com/anthropic', apiKey: 'fixture',
      models: [{id:'note', name:'Note', input:['text'], reasoning:false, contextWindow:8192, maxTokens:128,
      cost:{input:0, output:0, cacheRead:0, cacheWrite:0}}] });
    const owner = await createAgentSession({ modelRuntime: runtime, sessionManager: SessionManager.inMemory(process.cwd()),
      settingsManager: SettingsManager.inMemory(), noTools:'all' });
    try { assert.equal(await askInHost(owner, runtime, '你好'), '离线回复'); }
    finally { await owner.session.abort(); owner.session.dispose(); }
  `);
  run([...mock, "controls.mts"], { match: /离线回复/ });

  const desktop = join(zpi, "packages/desktop");
  for (const app of [desktop, quick]) {
    const cli = join(app, "bin/cli.mjs");
    assert.equal(run([cli, "--version"]).trim(), (await pkg(app)).version);
    run([cli, "--help"], { match: /Usage:/ });
  }
  const installed = await pkg(join(quick, "node_modules/@zpi-dev/agent-sdk"));
  assert.equal(installed.version, (await pkg(quick)).dependencies["@zpi-dev/agent-sdk"]);
  console.log(`Verified ${files.length} TypeScript blocks against SDK ${manifest.version} dist; success, error result, thrown error, stream, tool, fork and host passed offline. CLI help/version OK; Quick Chat SDK ${installed.version}.`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
