import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePart, products } from "../manuals/catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const zpi = resolve(process.env.ZPI_SOURCE || join(root, "../zpi"));
const quick = resolve(process.env.QUICK_CHAT_SOURCE || join(root, "../zpi-quick-chat"));
const dir = await mkdtemp(join(tmpdir(), "zpi-manual-examples-"));
const modules = join(dir, "node_modules");
async function article(product, part, key) {
  const groups = parsePart(await readFile(join(root, "manuals", product, part + ".md"), "utf8"));
  const [group, slug] = key.split("/");
  return groups.find((g) => g.id === group).articles.find((a) => a.id === slug).body;
}
const pkg = async (path) => JSON.parse(await readFile(join(path, "package.json"), "utf8"));
const env = { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, DEEPSEEK_API_KEY: "offline-example" };
function run(args, { environment = env, status = 0, match } = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: dir,
    env: environment,
    encoding: "utf8",
    timeout: 30000,
  });
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
  const tutorial = await article("zpi", "start", "start/first-edit");
  const practiceSetup = /^```sh\n([\s\S]*?)^```$/m.exec(tutorial)[1];
  const practice = spawnSync(
    "sh",
    ["-ec", `open() { test -f "$1/note.txt"; }; ${practiceSetup}\nprintf '%s' "$practice"`],
    {
      cwd: dir,
      env,
      encoding: "utf8",
    },
  );
  assert.equal(practice.status, 0, practice.stderr);
  assert.equal(await readFile(join(practice.stdout, "note.txt"), "utf8"), "状态：未开始\n保留：蓝色\n");
  const quickSetup = await article("zpi-quick-chat", "handbook", "start/install");
  const syntax = spawnSync("zsh", ["-n"], { input: /^```zsh\n([\s\S]*?)^```$/m.exec(quickSetup)[1], env });
  if (syntax.error?.code !== "ENOENT") assert.equal(syntax.status, 0, String(syntax.stderr));

  const files = [];
  for (const [, part] of products["zpi-agent-sdk"].parts) {
    const source = await readFile(join(root, "manuals/zpi-agent-sdk", part + ".md"), "utf8");
    for (const m of source.matchAll(/^```ts(?: ([-a-z0-9]+\.mts))?\n([\s\S]*?)^```$/gm)) {
      assert.ok(m[1] && !files.includes(m[1]), "example needs a unique filename: " + part);
      await writeFile(join(dir, m[1]), m[2]);
      files.push(m[1]);
    }
  }
  run([
    join(zpi, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--target",
    "ES2023",
    "--module",
    "NodeNext",
    "--types",
    "node",
    ...files,
  ]);
  const mock = ["--import", join(root, "tests/fixtures/manual-provider.mjs")];
  run([...mock, "first-query.mts"], { match: /成功： 离线回复/ });
  run([...mock, "first-query.mts"], {
    environment: { ...env, FIXTURE_FAILURE: "1" },
    status: 1,
    match: /失败： error_during_execution/,
  });
  run([...mock, "first-query.mts"], {
    environment: { ...env, DEEPSEEK_API_KEY: "" },
    status: 1,
    match: /查询异常： Model is not configured/,
  });
  run([...mock, "order.mts"], { match: /模型调用了工具 订单已发货/ });
  run([...mock, "branch.mts"], { match: /离线回复/ });
  const example = (args, match, extra = {}, status = 0) =>
    run([...mock, ...args], { match, environment: { ...env, ...extra }, status });
  const trace = example(["trace-loop.mts"], /4 完成/);
  assert.match(trace, /2 请求工具 lookup_order sample-call/);
  assert.match(trace, /3 工具响应 sample-call/);
  example(["trace-loop.mts"], /没有成功的查询记录/, { FIXTURE_SKIP_TOOL: "1" }, 1);
  example(["orders.mts", "42"], /业务记录：已发货/);
  example(["orders.mts", "99"], /业务记录：未找到/);
  example(["orders.mts", "42"], /模型没有查询订单/, { FIXTURE_SKIP_TOOL: "1" }, 1);
  example(["inspect.mts"], /上下文：/, { FIXTURE_NO_REQUEST: "1" });
  example(["provider.mts"], /internal\/service-model/, {
    MODEL_BASE_URL: "https://example.invalid/v1",
    MODEL_API_KEY: "offline",
    FIXTURE_NO_REQUEST: "1",
  });
  example(["input-id.mts"], /不同输入： 2/);
  example(["final-only.mts"], /正文： 离线回复/);
  example(["final-only.mts"], /收到失败终态/, { FIXTURE_FAILURE: "1" }, 1);
  example(["hook.mts"], /会话结束： 1 1/, { FIXTURE_HOOK: "1" });
  const first = example(["resume.mts"], /会话：/).match(/会话： (\S+)/)[1];
  assert.ok(example(["resume.mts", first], /会话：/).includes(first));
  example(["list-history.mts"], /练习订单 practice/);
  example(["rewind.mts"], /恢复后： before/, { FIXTURE_WRITE: "1" });
  example(["mirror.mts"], /同一会话： true 消息数： 4/);
  example(["delegate.mts"], /已观察到子角色/);
  await mkdir(join(dir, ".claude/skills/triage"), { recursive: true });
  const skill = await article("zpi-agent-sdk", "extensions", "resources/skill");
  await writeFile(join(dir, ".claude/skills/triage/SKILL.md"), /^```md\n([\s\S]*?)^```$/m.exec(skill)[1]);
  assert.match(example(["skills.mts"], /技能已注册： true/), /调用了技能： true/);
  await mkdir(join(dir, "sample/.claude-plugin"), { recursive: true });
  await mkdir(join(dir, "sample/commands"));
  await writeFile(
    join(dir, "sample/.claude-plugin/plugin.json"),
    JSON.stringify({ name: "sample", version: "1.0" }),
  );
  await writeFile(join(dir, "sample/commands/greet.md"), "请用一句话向 $ARGUMENTS 问候");
  example(["plugin.mts"], /插件命令完成/, { FIXTURE_PLUGIN: "1" });
  run([...mock, "structured.mts"], { environment: { ...env, FIXTURE_JSON: "1" }, match: /分类：.*bug/ });
  await writeFile(
    join(dir, "pixel.png"),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIAH7X/JwAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  const rounds = [...run([...mock, "follow.mts"]).matchAll(/本轮： (\S+) 离线回复/g)];
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0][1], rounds[1][1]);
  await writeFile(
    join(dir, "controls.mts"),
    `
    import assert from 'node:assert/strict';
    import { ModelRuntime, listSessions } from '@zpi-dev/agent-sdk';
    import { createAgentSession, SessionManager, SettingsManager, queryResult } from '@zpi-dev/agent-sdk/host';
    import { askInHost } from './host.mts';
    import { showTurn } from './stream.mts';
    const {approveRead}=await import('./approval.mts');
    const control={signal:new AbortController().signal,toolUseID:'demo',requestId:'demo'};
    const {capRead}=await import('./cap-read.mts');assert.equal((await capRead('Read',{file_path:'public-note.txt',limit:50},control)).updatedInput.limit,2);
    assert.equal((await capRead('Read',{file_path:'private'},control)).behavior,'deny');
    const {record}=await import('./timeline.mts');const rows=new Map();record(rows,{type:'assistant',message:{content:[{type:'tool_use',name:'Read',id:'a'},{type:'tool_use',name:'Read',id:'b'}]}});
    record(rows,{type:'user',message:{content:[{type:'tool_result',tool_use_id:'b',is_error:true}]}});assert.equal(rows.get('b').state,'失败');assert.equal(rows.get('a').state,'执行中');
    const {picture}=await import('./image.mts');const [image]=await Array.fromAsync(picture('pixel.png'));assert.equal(image.message.content[1].source.media_type,'image/png');assert.ok(image.message.content[1].source.data.startsWith('iVBOR'));
    const rule=approveRead(async p=>p==='ok');
    assert.equal((await rule('Read',{file_path:'ok'},control)).behavior,'allow');
    assert.equal((await rule('Write',{file_path:'ok'},control)).behavior,'deny');
    const options = { model: 'deepseek', tools: [], persistSession: false };
    assert.equal(await showTurn('你好', options), '离线回复');
    process.env.FIXTURE_FAILURE = '1';
    await assert.rejects(queryResult({prompt: '你好', options}), e => e.sdkResult?.subtype === 'error_during_execution');
    delete process.env.FIXTURE_FAILURE;
    const histories = await listSessions({dir: process.cwd(), zpi: {agentDir: '.practice-sdk'}});
    assert.equal(new Set(histories.map(r => r.sessionId)).size, 2);
    await assert.rejects(queryResult({prompt: (async function*(){})(), options}), /no result/);
    const runtime = await ModelRuntime.create();
    runtime.registerProvider('practice', { api: 'anthropic-messages', baseUrl: 'https://api.deepseek.com/anthropic', apiKey: 'fixture',
      models: [{id:'note', name:'Note', input:['text'], reasoning:false, contextWindow:8192, maxTokens:128,
      cost:{input:0, output:0, cacheRead:0, cacheWrite:0}}] });
    const owner = await createAgentSession({ modelRuntime: runtime, sessionManager: SessionManager.inMemory(process.cwd()),
      settingsManager: SettingsManager.inMemory(), noTools:'all' });
    try { assert.equal(await askInHost(owner, runtime, '你好'), '离线回复');
      const {stopOwned}=await import('./host-control.mts');let stopped; await stopOwned(owner,runtime,'job',async (s,t)=>{stopped=[s,t]});assert.deepEqual(stopped,[owner.session.sessionId,'job']); }
    finally { await owner.session.abort(); owner.session.dispose(); }
  `,
  );
  run([...mock, "controls.mts"], { match: /离线回复/ });

  const desktop = join(zpi, "packages/desktop");
  for (const app of [desktop, quick]) {
    const cli = join(app, "bin/cli.mjs");
    assert.equal(run([cli, "--version"]).trim(), (await pkg(app)).version);
    run([cli, "--help"], { match: /Usage:/ });
  }
  const installed = await pkg(join(quick, "node_modules/@zpi-dev/agent-sdk"));
  assert.equal(installed.version, (await pkg(quick)).dependencies["@zpi-dev/agent-sdk"]);
  console.log(
    `Verified ${files.length} TypeScript blocks against SDK ${manifest.version} dist; offline checks cover CLI evidence, failures, metadata, stream, typed inputs, tools, approval, rewind, history, mirror, delegation, plugins, hooks and host. CLI help/version OK; Quick Chat SDK ${installed.version}.`,
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
