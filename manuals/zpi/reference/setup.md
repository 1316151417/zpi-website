# 安装命令、平台与模型接入

这里查桌面端的启动方式、平台声明和凭据入口。桌面应用、Quick Chat 与 SDK 是三个包；它们不共享同一份配置表。

| 用途 | 命令或要求 | 范围 |
| --- | --- | --- |
| 运行环境 | Node.js `>=24 <25`，npm | 桌面包排除 Windows；主要验证环境为 Apple Silicon Mac。包未排除某平台，不代表所有系统组合都验证过 |
| 直接启动 | `npx @zpi-dev/desktop` | 可以由 npm 下载并缓存；允许依赖安装脚本准备 Electron 和终端环境 |
| 固定命令 | `npm install -g @zpi-dev/desktop`，再运行 `zpi-desktop` | 当前 npm 全局环境；PATH 需要包含全局 bin |
| 查看本机包 | `zpi-desktop --version` / `zpi-desktop --help` | 全局安装后使用；不需要启动图形界面 |
| 更新 | 退出后 `npx @zpi-dev/desktop@latest` 或重新全局安装 `@latest` | `latest` 由 npm 解析，不是本手册的源码版本号 |

## 服务商与协议 {#providers}

| 来源 | 凭据与协议 | 生效条件 |
| --- | --- | --- |
| OpenAI（ChatGPT） | 在设置中 OAuth 登录，不是填网页 Cookie | 可用模型由账号决定；请求前可续期令牌 |
| OpenAI（API） | `OPENAI_API_KEY`；官方 Responses | 与订阅登录是两个入口 |
| DeepSeek | `DEEPSEEK_API_KEY` | 模型服务的 Key 不自动成为桌面「联网搜索」的专用 Key |
| 智谱 Coding Plan / API | 依次查 `ZHIPU_API_KEY`、`ZHIPU_CODING_API_KEY`、`ZAI_CODING_CN_API_KEY`；按量另查 `ZHIPU_PAYGO_API_KEY`、`ZHIPU_STANDARD_API_KEY` | 匹配对应预置，不混为同一套餐 |
| MiniMax Coding Plan / API | `MINIMAX_API_KEY` / `MINIMAX_PAYGO_API_KEY` | 同上 |
| MiMo Token Plan / API | `MIMO_API_KEY`、`XIAOMI_TOKEN_PLAN_CN_API_KEY` / `MIMO_PAYGO_API_KEY`、`XIAOMI_API_KEY` | 各组取第一个有效值 |
| 自定义提供商 | API 地址、凭据、模型 ID；按服务实际支持选 Chat Completions、Anthropic Messages 或 Responses | 输入与输出能力、上下文、推理配置不要照抄另一模型 |

环境发现用于初始化缺少的预置，不覆盖已有配置。更改 Shell 配置后需让新进程取得新环境。已注册模型并不意味着账号获得使用资格。官网列出的是展示用目录，不能在网页验证真实凭据。

下一步：[在桌面完成首次模型选择](../how-to/models.md)。
