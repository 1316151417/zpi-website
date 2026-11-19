# 安装、环境变量与本地版本

这里查能运行 Quick Chat 的机器，以及为什么装好桌面 ZPI 的账号仍不能直接使用。

| 项目 | 值 | 适用范围 |
| --- | --- | --- |
| 平台 | macOS `darwin`、Apple Silicon `arm64`、Node.js `>=24 <25` | 独立 Electron 浮窗，包内含原生辅助程序；不是桌面端的一个设置项 |
| 即用 / 全局 | `npx @zpi-dev/quick-chat` / `npm install -g @zpi-dev/quick-chat` 后 `zpi-quick-chat` | 首次 npm 安装需联网；更新先退出，使用相同包名加 `@latest` |
| 版本和帮助 | `zpi-quick-chat --version`、`zpi-quick-chat --help` | 已全局安装时，无需模型请求 |
| `DEEPSEEK_API_KEY` | 必填，无默认值 | 在启动进程的环境中设置；用于模型和开启的联网工具。不要放进提示、源码或截图 |
| `ZPI_QUICK_CHAT_MODEL` | 省略时 `deepseek`；也只接受 `deepseek` | 不可换成桌面里任意模型 ID |
| `ZPI_QUICK_CHAT_REASONING` | `disable`（默认）或 `low` | 读取启动环境；改后退出重开 |

macOS 默认 zsh 中，如未配置过 Key，可在启动终端私下输入（输入不回显，Key 不写进命令历史）：

```zsh
read -rs 'DEEPSEEK_API_KEY?DeepSeek API Key: '; printf '\n'
export DEEPSEEK_API_KEY
npx @zpi-dev/quick-chat
```

这份说明核对的是 Quick Chat 0.1.14，依赖 SDK 0.1.63，并未验证所有 npm 历史版本或当前 dist-tag。官网演示只展示窗口与四种场景，不读取这里的变量。下一步：[从另一个应用带入第一句](../tutorial/selection.md)。
