# guide | Agent SDK 使用指南
## loop | Agent 循环如何工作
一条用户输入不一定只发一次模型请求。模型第一次可能不回答，而是返回「请查订单」；SDK 执行你的工具，把结果交还模型，再由模型决定是否已经有足够的证据。**你不需要再递归调用 query 来推进工具循环。**

### 跟踪一次实际运行

按[快速开始](../start/first.html)准备 Node.js 24 与凭据，再运行 `npm install typebox@1.3.27`。将下例保存为 `trace-loop.mts`，运行 `node trace-loop.mts`：

```ts trace-loop.mts
import { query, defineTool } from '@zpi-dev/agent-sdk';
import { Type } from 'typebox';
const order = defineTool({
  name: 'lookup_order', description: '查练习订单的配送状态',
  parameters: Type.Object({id:Type.String()}),
  execute({id}) {return {id,status:id==='42'?'已发货':'未找到'};}
});
const calls=new Set<string>(); let observed=false;
for await (const m of query({prompt:'请调用 lookup_order 查询订单 42，再回答。',
  options:{model:'deepseek',tools:[order.name],zpi:{customTools:[order]},persistSession:false,maxTurns:3}})) {
  if(m.type==='system' && m.subtype==='init') console.log('1 初始化', m.tools);
  if(m.type==='assistant') for(const b of m.message.content) {
    if(b.type==='tool_use'){calls.add(b.id);console.log('2 请求工具', b.name,b.id);}
  }
  if(m.type==='user' && Array.isArray(m.message.content)) for(const b of m.message.content) {
    if(b.type==='tool_result' && calls.has(b.tool_use_id)) {
      observed ||= !b.is_error; console.log('3 工具响应', b.tool_use_id, b.content);
    }
  }
  if(m.type==='result') {
    if(m.subtype!=='success') throw Error(m.errors.join('; '));
    if(!observed) throw Error('没有成功的查询记录，不能确认状态');
    console.log('4 完成', m.result, '模型请求次数',m.num_turns);
  }
}
```

典型成功轨迹是 `1 → 2 → 3 → 4`。第 2、3 行的 ID 相同。模型可能直接回答或调用多次，不能把每轮硬编码成四条消息；本例宁愿报“没有成功的查询记录”，也不把没查过的订单当已发货。

### 谁决定下一步？

模型提出调用，SDK 校验参数并执行工具，你的回调决定业务授权；工具输出作为结果进入上下文，供下一次模型请求使用。工具失败后模型可能改用别的办法，所以一次 `tool_result.is_error` 与整轮 `result.subtype` 是两件事。若有业务写入，以业务系统的回执核验，而不以自然语言验收。

### 循环何时结束？

模型正常收尾、达到轮数或预算限制、用户中断、执行失败都可能结束本轮。`maxTurns` 限的是一次用户输入的模型调用次数，不是可发送的用户消息数。打开新页面或从 UI 隐藏气泡不会停止后端。用[中断与释放对照](../lifecycle/controls.html)给停止按钮接上正确的对象。

## input | 单次输入与流式输入
选择输入方式的依据是**什么时候知道下一条用户消息**，不是“是否想流式显示”。字符串也能得到流式输出；异步输入也能只消费每轮最终结果。

| 情景 | `prompt` | 消费方式 |
|---|---|---|
| HTTP 请求，一次问完 | 字符串 | 单个 Query，用 result 或 queryResult 完成请求 |
| 聊天窗口稍后还要追问 | `AsyncIterable<SDKUserMessage>` | 同一个循环消费，每个输入分别结算 result |
| 用户明天回来 | 新 Query，传 `resume` | 从持久化会话继续，不让昨日的进程一直等待 |

### 让两次输入沿用同一个上下文

运行[多轮输入示例](../sessions/follow.html)。它依次交付两条 SDKUserMessage，两条 result 应有同一个 session_id。真实 UI 中，把一次“发送”作为输入队列的一项，页面结束时关闭队列；整个应用只有一个消费者。如果每个组件都各自 for await，相当于竞争同一队列，而不是给所有组件广播。

### 不要混淆四种 ID

保存用户 UUID 关联自己的待发气泡，用 tool_use_id 配对工具请求，用 task_id 控制后台作业，用 session_id 恢复会话。即使两次输入文字相同，也不应用文字作键。已有会话不必发送伪造的 tool_result，结果由实际执行方产生。

## migrate | 从其他 Agent SDK 迁移
从一个**只有文本输入、没有工具**的查询开始迁移。先对齐执行者、身份和失败处理，再逐项开放工具；把一整份 Claude Agent SDK 配置传进来会遇到不支持的选项。此页是能力对照，不是两个包的兼容性承诺。

| 旧应用依赖什么 | 在 ZPI 0.1.65 中怎么做 | 验收点 |
|---|---|---|
| Claude CLI 或订阅登录 | 用 Node.js 和服务端提供商凭据运行 `query()` | 移除 key 后是配置错误，而不是弹出授权 UI |
| 自定义工具或 MCP 服务 | 用 `defineTool` 和 `zpi.customTools` 注册函数，`tools` 选择可见项；没有 MCP 客户端 | 在 init 工具清单和实际调用中都看到该名称 |
| 权限模式与内置审批 | 设置 `disallowedTools`、`allowedTools`、`canUseTool` | 实际拒绝一次，并验证文件/业务数据没有改变 |
| 工作目录隔离或托管沙箱 | `cwd` 只规定起点，隔离由你的运行环境提供 | 两个用户不能通过猜测会话 ID 或路径读取彼此数据 |
| 自动加载项目资源 | 用 `settingSources` 明确选择来源 | 空来源做基线，再启用项目资源并核对 init |
| Python、Glob/Grep 或其他 SDK 专属函数 | 本册只有 Node/TypeScript 入口，Glob/Grep 为保留项；按本产品公开签名重新选型 | 不从内部包导入缺失 API |

### 移植一段已有逻辑

将原来的一次请求缩成[最小程序](../start/first.html)，分别验证成功结果、失败结果和初始化抛错。再移植一个业务工具，故意拒绝它，核对 `permission_denials` 和自己的数据。最后才迁移会话存储：验证从另一个进程恢复、分叉保留原历史以及子记录未丢失。完整字段见 [TypeScript SDK](../typescript.html)。

## examples | 示例与实作
按要交付的功能选一项。每个链接都有准备步骤、完整 `.mts` 源码和验收条件；适配器示例需要被应用导入，而不是单独运行就能启动服务。

| 我要做什么 | 示例 | 运行后检查 |
|---|---|---|
| 打通第一个模型请求 | [first-query.mts](../start/first.html) | 输出成功结果；密钥未配置时不要显示空成功 |
| 看一整轮发生了什么 | [trace-loop.mts](loop.html) | 工具请求和返回的 ID 配对 |
| 为真实业务提供有限的查询能力 | [orders.mts](../workshop/cli.html) | 订单 42 与 99 得到不同业务记录，不靠模型猜 |
| 把增量画到聊天窗口 | [stream.mts](../output/stream.html) | 每段正文只显示一次 |
| 跨进程继续昨天的会话 | [resume.mts](../history/reopen.html) | 两次运行的 session_id 相同 |
| 修改前预留撤销路径 | [rewind.mts](../history/undo.html) | 写入、预检、读回三步一致 |
| 接入已有的历史服务 | [mirror.mts](../storage/adapter.html) | 改变本地运行目录后仍能读回两轮历史 |
| 把独立调查交给角色 | [delegate.mts](../agents/role.html) | 区分父任务的结果和子角色投影 |

第一次练习不要给程序无关工具、生产数据或可写的共享目录。示例中的内存数据用于核对协议，不是用来替代生产授权或持久化。

## hosting | 在服务端运行 Agent
在自己的 Node.js 进程运行 SDK，浏览器只提交输入和显示经过筛选的事件。网页不应获得模型密钥、宿主文件路径或可任意执行工具的权限。ZPI 没有替你提供托管代理服务。

### 最小请求生命周期

1. 在服务端认证请求，将用户与自己的会话 ID 建立绑定。拒绝不属于该用户的恢复、删除或停止操作。
2. 根据业务需要选模型和工具；把工作目录、总截止时间、maxTurns 与预算作为本次运行的策略。不能依赖 cwd 或系统提示实现文件隔离。
3. 一份 Query 只交给一个消费者。把正文和任务进度发给客户端，按服务端的工具记录和 result 确定完成状态。
4. 客户端断开时决定是继续已授权的工作，还是取消并 `await run.return()`；在 finally 中释放资源。不要把所有用户挂到一个全局 AbortController。

### 上线前测试三个失败场景

没有凭据时，界面应区分“没开始”和“模型返回失败”；用户拒绝工具时，业务记录不能有写入；镜像不可用时，不能仅凭回答成功向用户承诺“历史已保存”。若希望保留跨进程作业，自己提供作业所有者；SDK 自管的单字符串查询不会自动变成后台任务服务。
