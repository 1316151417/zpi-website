const { test } = require("node:test");
const assert = require("node:assert/strict");
const { FileSystem, Shell, DemoRunner, normalize, DESKTOP, HOME, PROMPT } = require("../js/core.js");

test("paths resolve home, parents, relative and absolute paths", () => {
  assert.equal(normalize("~/Desktop/../Projects"), HOME + "/Projects");
  assert.equal(normalize("./a/../b"), DESKTOP + "/b");
  assert.equal(normalize("../../../../../../"), "/");
});

test("file system supports shared writes, subscriptions and snapshots", () => {
  const fs = new FileSystem();
  const changes = [];
  fs.subscribe((change) => changes.push(change));
  fs.mkdir(DESKTOP + "/test");
  fs.write(DESKTOP + "/test/a.txt", "hello");
  fs.rename(DESKTOP + "/test", DESKTOP + "/renamed");
  assert.equal(fs.read(DESKTOP + "/renamed/a.txt"), "hello");
  assert.equal(fs.stat(DESKTOP + "/test/a.txt"), undefined);
  fs.write("renamed/a.txt", "updated");
  assert.deepEqual(changes, [
    { paths: [DESKTOP + "/test"], entriesChanged: true },
    { paths: [DESKTOP + "/test/a.txt"], entriesChanged: true },
    {
      paths: [DESKTOP + "/test", DESKTOP + "/renamed", DESKTOP + "/test/a.txt", DESKTOP + "/renamed/a.txt"],
      entriesChanged: true,
    },
    { paths: [DESKTOP + "/renamed/a.txt"], entriesChanged: false },
  ]);
  const copy = new FileSystem(fs.snapshot());
  assert.equal(copy.read(DESKTOP + "/renamed/a.txt"), "updated");
  copy.remove(DESKTOP + "/renamed/a.txt");
  copy.remove(DESKTOP + "/renamed");
  assert.equal(fs.read(DESKTOP + "/renamed/a.txt"), "updated");
});

test("each new desktop is empty and only contains the demo home hierarchy", () => {
  const fs = new FileSystem();
  assert.deepEqual(fs.list(DESKTOP), []);
  assert.deepEqual(Object.keys(fs.nodes), ["/", "/Users", HOME, DESKTOP]);
  fs.write("draft.md", "temporary");
  assert.deepEqual(new FileSystem().list(DESKTOP), []);
});

test("Tab completes commands and virtual paths at the caret, without executing anything", () => {
  const fs = new FileSystem(),
    shell = new Shell(fs);
  fs.write("daily note.md", "x");
  fs.write("daily news.md", "y");
  fs.mkdir("data");
  assert.equal(shell.complete("wh").line, "whoami ");
  assert.deepEqual(shell.complete("c").candidates, ["cat", "cd", "clear"]);
  assert.equal(shell.complete("cd da").line, "cd data/");
  assert.equal(shell.complete("ls ~/Des").line, "ls ~/Desktop/");
  assert.equal(shell.complete('cat "daily not').line, "cat daily\\ note.md ");
  assert.equal(shell.execute(shell.complete('cat "daily not').line).output, "x");
  assert.equal(shell.complete("cat daily\\ n").candidates.length, 2);
  assert.equal(shell.complete("echo x > dai  suffix", 12).line, "echo x > daily\\ n  suffix");
  assert.deepEqual(shell.complete("cat absent").candidates, []);
});

test("file system protects roots, nonempty directories and invalid destinations", () => {
  const fs = new FileSystem();
  assert.throws(() => fs.remove(DESKTOP));
  assert.throws(() => fs.rename(HOME, "/renamed"));
  assert.throws(() => fs.write(DESKTOP, "x"));
  assert.throws(() => fs.mkdir("/missing/dir"));
  fs.mkdir(DESKTOP + "/a");
  fs.write(DESKTOP + "/a/x", "x");
  assert.throws(() => fs.remove(DESKTOP + "/a"));
  assert.throws(() => fs.rename(DESKTOP + "/a", DESKTOP + "/a/nested"));
});

test("invalid persisted snapshots recover to a valid initial filesystem", () => {
  for (const value of [
    null,
    [],
    "bad",
    { "/bad": null },
    { "/a/../b": { type: "file", content: "x" } },
    { "/missing/file": { type: "file", content: "x" } },
    { "/": { type: "file", content: "x" } },
  ]) {
    assert.equal(new FileSystem(value).stat(DESKTOP).type, "dir");
  }
});

test("terminal commands share file state and preserve quoted names", () => {
  const fs = new FileSystem(),
    shell = new Shell(fs);
  assert.equal(shell.execute("pwd").output, DESKTOP);
  assert.equal(shell.execute('mkdir "my project"').error, undefined);
  shell.execute('cd "my project"');
  shell.execute('echo "hello world" > "a file.txt"');
  shell.execute('echo again >> "a file.txt"');
  assert.equal(shell.execute('cat "a file.txt"').output, "hello world\nagain\n");
  shell.execute('touch "a file.txt"');
  assert.equal(fs.read(DESKTOP + "/my project/a file.txt"), "hello world\nagain\n");
  shell.execute('mv "a file.txt" b.txt');
  assert.equal(shell.execute("open b.txt").open, DESKTOP + "/my project/b.txt");
  shell.execute("rm b.txt");
  assert.equal(shell.execute("cat b.txt").error, true);
  assert.equal(shell.execute("clear").clear, true);
  assert.equal(shell.execute('echo "unclosed').error, true);
  assert.equal(shell.execute("curl https://example.com").error, true);
  assert.equal(shell.execute("npm").error, true);
  assert.match(shell.execute("help").output, /Tab 补全/);
});

function clock() {
  let index = 0;
  const timers = new Map();
  return {
    setTimeout(fn, delay) {
      const id = ++index;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    run() {
      for (const [id, timer] of [...timers].sort((a, b) => a[1].delay - b[1].delay)) {
        if (timers.has(id)) {
          timers.delete(id);
          timer.fn();
        }
      }
    },
    size: () => timers.size,
  };
}

test("any prompt becomes the same deterministic workflow", () => {
  const timer = clock(),
    events = [];
  const runner = new DemoRunner((event) => events.push(event), timer);
  runner.start("今天天气如何？");
  timer.run();
  assert.equal(events[0].prompt, PROMPT);
  assert.equal(events[0].original, "今天天气如何？");
  assert.deepEqual(
    events.map((event) => event.type),
    ["start", "plan", "inspect", "write", "file", "verify", "complete"],
  );
  assert.equal(runner.running, false);
});

test("stopping cancels all remaining work and a replacement cannot receive stale events", () => {
  const timer = clock(),
    events = [];
  const runner = new DemoRunner((event) => events.push(event), timer);
  runner.start("first");
  runner.stop();
  timer.run();
  assert.deepEqual(
    events.map((event) => event.type),
    ["start", "stop"],
  );
  assert.equal(timer.size(), 0);
  events.length = 0;
  runner.start("old");
  runner.start("new");
  timer.run();
  const lastStart = events[1].id;
  assert.equal(events.filter((event) => event.type === "file").length, 1);
  assert.equal(events.at(-1).id, lastStart);
});
