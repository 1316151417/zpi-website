ZPI Agent SDK 是给 Node.js 程序用的，不是另一套聊天窗口。你的程序接收用户输入，SDK 负责让模型、工具和结果在同一轮里衔接；哪些工具可以用、谁批准、什么算业务成功，仍由你的应用决定。

### 从一个可以运行的程序开始
准备 Node.js 24.x、服务端模型密钥和空项目，安装与本教程相同的版本：

```sh
npm install @zpi-dev/agent-sdk@0.1.65
```

先[发出第一条查询](start/first.html)，看到一次成功结果，再做[能交付给用户的订单查询 CLI](workshop/cli.html)。拿订单 42 和不存在的 99 分别跑一次：你不仅要看到回答，还要证明模型确实查了那张订单。标有文件名的 TypeScript 示例可下载，对应的独立脚本用 `node 文件名.mts` 运行，适配器则按文章说明导入。

### 按你正在开发的功能读
- **给聊天界面接事件**：[不重复描画流式文字](output/stream.html) → [按 ID 配对工具调用与结果](events/tool-pair.html) → [正确处理停止与断开](lifecycle/controls.html)。
- **给程序有限的操作能力**：[写一个业务工具](tools/define.html) → [执行前缩小输入范围](policy/replacement.html) → [在临时目录验证文件回退](history/undo.html)。
- **让用户明天能继续**：[跨进程恢复指定会话](history/reopen.html) → [分页和命名历史](history/list.html) → [换一个本地运行目录，从同一镜像恢复](storage/adapter.html)。
- **已有自己的会话服务**：先读[谁拥有 session 和 manager](host/owner.html)，再接[宿主的停止端口](host/control.html)。普通业务脚本不必先学 `/host`。
