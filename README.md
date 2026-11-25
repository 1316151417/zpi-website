# ZPI 官网

主页介绍 ZPI、ZPI Quick Chat 和 ZPI Agent SDK，提供安装方法并嵌入独立的交互桌面。桌面里的 ZPI 和 Quick Chat 使用原产品前端源码，不维护另一套 UI，不修改产品配色、组件大小或设置页布局。

## 启动

默认使用相邻仓库及其中已经安装的依赖：

```text
IdeaProjects/
├── zpi/
├── zpi-quick-chat/
└── zpi-website/
```

```sh
# Node.js 24.x；原产品仓库须已安装依赖
npm run dev
# http://127.0.0.1:4173

# 输出可独立部署的静态网站
npm run build
npm run preview
```

也可以指定源码目录：

```sh
ZPI_SOURCE=/path/to/zpi \
QUICK_CHAT_SOURCE=/path/to/zpi-quick-chat \
npm run build
```

构建后的 `dist/` 不需要两个源码仓库或 Node.js 后端，上传普通静态服务器即可。**由于原前端使用 ES modules、动态导入和 Worker，需通过 HTTP/HTTPS 打开，不能再以 `file://` 双击运行。** 生成的 `snake.html` 仍是独立、可离线打开的 HTML。

## 主页与演示入口

`index.html` 是介绍主页，通过 `?product=zpi|zpi-quick-chat|zpi-agent-sdk` 直达对应产品的安装说明和交互演示。普通点击标签只切换产品，不把 `?product=` 写进地址栏；若是从产品直达链接进入，切换时移除该参数。前进/后退恢复对应产品，无参数新开或刷新均回到 Desktop。修饰键打开新标签、复制产品链接仍使用参数直达。同一张桌面展台配合导航选中条切换，不截取或翻转整页。每次只挂载当前产品的演示；Quick Chat 和 SDK 不会预加载 ZPI 渲染器，通过 Dock 打开时才加载。减少动态效果模式下直接切换。安装命令和复制按钮在演示旁；展开「安装说明」可查看环境要求和首次配置。首次访问默认浅色，不跟随系统自动切换。介绍页、三册手册和独立演示共用右上角的日月按钮和同一份主题偏好：切换后写入此浏览器的 `zpi-website:theme`，刷新、返回、直接进入深层章节或打开另一个同源标签页都保持同步。顶层页面的显式 `theme=light|dark` 链接也可指定主题。嵌入演示继承所在产品页的选择，不重建窗口，也不保存产品自己的设置。浏览器禁止存储时，仍可切换当前页。

`demo.html` 是可单独打开或嵌入其他站点的交互桌面。例如：`./demo.html?app=zpi&autoplay=1`。原有根路径 `?app=…`、`?autoplay=…` 和产品哈希链接兼容跳转至该入口。下表的参数均用于演示页。

| 查询参数 | 自动演示 |
| --- | --- |
| `?app=zpi&autoplay=1` | 演示任务：打字、执行过程、写入游戏、浏览器预览 |
| `?app=zpi-quick-chat&autoplay=1` | ZPI Quick Chat：键入翻译请求并展示结果 |
| `?app=zpi-agent-sdk&autoplay=1` | ZPI Agent SDK：一秒后显示固定问候 |
| `?app=all&autoplay=1` | 按上述顺序播放；每段结果短暂停留后关闭窗口，间隔三秒再打开下一款，最后一款结束后留在桌面 |

每次进入演示先显示空桌面。一秒后，待目标界面就绪再开窗；等待时点击 Dock 可以直接接管。将 `autoplay` 设为 `0` 只打开目标应用，不运行。无参数保留 ZPI 默认演示。Dock 切换与真实键盘/指针输入会中断导览：已提交的工作可以继续，但不会强制跳到下一款产品。旧产品哈希入口仍可使用。每个顶层官网实例拥有自己的临时桌面；在其他主页中可分别嵌入这些地址。

### 部署在域名根目录或 /zpi/

`npm run build` 生成同一份 `dist/`，Vite 的 `base: "./"` 和手册的相对链接不绑定域名。复制的是 **dist 的内容**，不要再套一层 `dist/`。任选一种挂载：

- **`https://zpi.zjyo.cn/`**：在该子域的虚拟主机内设 `root /srv/zpi/dist; index index.html;`，`location / { try_files $uri $uri/ =404; }`。裸域名直接显示产品首页。
- **`https://zjyo.cn/zpi/`**：例如将 `/srv/www/zpi/` 指向构建产物，在主站已有的 `server` 中仅增加以下两个 location。不要替换主站其他路由。`/zpi` 必须补尾斜杠，查询参数照留，否则浏览器会把 `./assets/` 解析到主站根。

```nginx
location = /zpi { return 308 /zpi/$is_args$args; }
location ^~ /zpi/ {
    root /srv/www;
    index index.html;
    try_files $uri $uri/ =404;
}
```

当前公网 IP 与未来域名的部署策略不同：`101.200.240.206` 的 80 端口只把 `/zpi/` 转给本机 8080；其专用虚拟主机的兜底 `location / { return 404; }`，不要保留根目录裸 `index.html`、`/manuals/`、`/assets/` 的静态匹配。独立 `/open-zread/` 保留自己的 location。子域名根部署能力不改变这项 IP 入口限制。

先移除与所选入口冲突的旧 `/zpi/` 重定向，启用静态 MIME 表（尤其 `.js`、`.css`、`.wasm`），不要把缺失资源重写成首页。DNS 和 HTTPS 证书需在部署时配置；以上示例不修改现有服务器。`MOUNT_PATH=/zpi PORT=4180 npm run preview` 可在 `http://127.0.0.1:4180/zpi/` 验收子路径；`npm run test:mounts` 在两个隔离的本地地址验证同一产物。

## 三本中文使用手册

介绍页与手册共用 `src/reading/reading.css`：中文优先使用系统苹方，英文和数字使用本站托管的 Source Sans 3，正文 17px / 400 / 1.7，阅读栏最多 660px。宽屏为交互桌面留出独立空间，字体与正文样式不注入演示 iframe。手册与产品页共用 `src/reading/theme.js` 和 `theme.css`；代码高亮跟随站点主题，原始示例仍可下载，在窄屏可展开本册目录；有多个小节的文章还可展开本页目录。字体许可随字体一同分发于 `reading/fonts/SourceSans3-OFL.txt`。

主页标题栏的「使用手册」在 GitHub 左侧，跟随当前产品，不进入交互桌面。直接打开 `manuals/zpi/index.html`、`manuals/zpi-quick-chat/index.html` 或 `manuals/zpi-agent-sdk/index.html` 即可阅读部署后的静态页。每册先介绍用途、安装和快速入门，再按实际任务组织章节；页尾保留教程、操作指南、参考手册和概念解释索引。手机可在正文前展开本册目录；`manuals/index.html` 是总索引。正文、导航和锚点无需 JavaScript 或服务端重写。

源文位于 `manuals/<产品>/*.md`。每个 `# 分组标识 | 名称` 内的 `## 文章标识 | 标题` 各自生成独立 `.html` 页面。文章之间使用相对 `.html` 链接；已发布的旧文章和片段由 `manuals/legacy.mjs` 映射到新章节。`scripts/manuals.mjs` 在开发服务器启动及生产构建时用相邻 Quick Chat 已装的 Marked 生成页面，并用 ZPI 自带的 Shiki 在构建时给代码着色（不向读者发送高亮脚本）。单独预览内容变更可运行 `node scripts/manuals.mjs`；测试生产产物仍需重新构建。源码基线、分册格式和验证范围见 [维护清单](manuals/MAINTENANCE.md)。

## 原版复用范围

### ZPI

直接导入 `zpi/packages/desktop/src/renderer/main.tsx`，由原入口加载：

- `App.tsx`、原始首页和任务布局；
- `SettingsPage.tsx` 及其全部设置分类，在原页面内切换；
- `@zpi-dev/ui` 的输入框、对话、Markdown、工具卡片和共享样式；
- 任务列表、分组、搜索、菜单、左右侧栏及面板布局；
- 文件管理器、文件预览、浏览器工具栏、审查组件、xterm 终端；
- 原主题、字号、快捷键、弹层与控件交互。

任务分组操作也直接复用原版 `applyTaskGroupCommand`，不是另写一个简化分组实现。

### Quick Chat

构建时读取原始 `src/index.html`，仅更换脚本入口、样式加载位置和 Electron 专用 CSP；页面主体来自原文件。

直接导入原 `renderer.ts`、`style.css`，包括：

- 胶囊输入条、展开布局、模型输出与 Markdown；
- 新建、固定、发送、停止、工具开关；
- 输入法、Enter / Shift+Enter、图片粘贴与预览；
- 消息折叠、跟随滚动、来源、复制、错误提示；
- 原始八方向缩放手柄和相关指针事件。

窗口的尺寸与位置计算直接导入原 `window.ts` 中的 `defaultWindowSize`、`windowBounds`、`resizedWindowBounds` 和 `windowSizes`。浏览器窗口控制器承接 Electron 的位置/可见性职责：

- 输入条默认 44px 高，宽度按原显示区域公式计算；
- 展开围绕输入框底部中心，保留原 16px 侧边留白与底部 inset；
- 失焦隐藏，固定后保留；
- 原生拖动区域在网页中可拖动；
- 缩放约束、手动调整后的尺寸、隐藏重开位置保持；
- 大窗口中新建仍保留大窗口；空白会话隐藏后重开收回胶囊；
- Option+Space 唤起/隐藏，Option+Shift+Space 新建；
- Esc 先停止任务，再隐藏窗口。

## npm 包与源码依赖

当前 `@zpi-dev/ui` 在源码中标记为 `private`，桌面和 Quick Chat 发布包也没有提供可嵌入网站的 UI export。直接安装桌面 npm 包会带入 Electron，而不是获得一个网页 React 组件库。

因此本版本通过可配置源码路径构建原 UI，**不伪造一个“已发布 UI 包”依赖**。`scripts/runtime.mjs` 使用 ZPI 仓库的 Vite、Tailwind 和 React 依赖，避免为官网再安装一套版本不同的 React。

构建生成 `source-versions.json`，记录两边版本、Git revision，以及 App、SettingsPage、CSS、Quick Chat HTML/renderer/window 源文件的 SHA-256。测试会校验这些值。

## 浏览器适配边界

源码复用能消除独立重绘造成的界面偏差，**不等于已经证明浏览器与 Electron/macOS 在所有像素及系统行为上绝对一致**。未对全部状态做逐像素差分，不声称“零误差”。

- ZPI 的 `window.zpi` 和 Quick Chat 的 `window.quickChat` 由网页沙箱实现。
- Electron `<webview>` 由隔离 iframe 承接，原浏览器工具栏不变。
- macOS 原生红黄绿按钮由单独的 native chrome 适配绘制；OS vibrancy、阴影、系统字体渲染和窗口管理仍受浏览器/系统影响。
- 快捷键只在网页获得焦点时工作；浏览器或系统保留的快捷键不能保证覆盖。
- 不能注册真正的系统级热键、监听其他应用、读取跨应用选区，或复制 macOS 原生面板的全部行为。
- 原 UI 提供的模型、登录、搜索、插件、Hook、进程功能不连接真实服务。未适配的本机 API 返回明确错误，不假装成功。
- API Key 不保存、不发送。请勿在公开演示中输入真实凭据。
- 桌面模式下 ZPI 默认居中显示 1200 × 800 像素（3:2）浮窗。空间不足时按比例缩小窗口的实际宽高，字体不缩放；窗口仍可手动缩放或最大化。桌面模式下左侧任务栏默认展开并占用独立一列；手动收起或展开后，调整窗口大小不会改变该选择。默认三栏以主对话最宽，右栏约占任务列表以外空间的三分之一。浏览器视口宽至少 1600px 且高至少 900px 时，首页三个产品的展台统一增高到 680–720px，不改变首页总宽度或安装栏的位置；此时任务栏默认取原生分隔条的最小宽度 200px，让「复杂任务」和「等待确认」能同排完整显示。紧凑嵌入中为窗口按钮和预览各保留最小宽度；预览卡片按实际可用宽度换行，不缩小字号。仅当应用窗口宽度不超过 550px 时，打开右栏才暂时收起对话，关闭即可回到原任务。手机首页按介绍、演示、安装排序；首页演示桌面宽度不超过 540px 时，ZPI 窗口使用 Dock 上方的可用高度，任务列表默认收起，手动开合优先。独立桌面不受这个手机展台规则影响。

## 预设任务与文件系统

ZPI 主应用首次自动输入“帮我写一个 HTML 版贪吃蛇游戏”。主应用提交任意非空消息都归一为编写贪吃蛇，向**原对话 reducer**发送预设事件。任务运行时仍能操作原 UI；有用户操作时，完成后不强制切回浏览器。

初始任务列表包含可操作的“演示任务”和固定的“复杂任务”样例。后者不是上次访问的历史：多轮消息、导航、提问、后台终端和子智能体由只读快照驱动，不实际运行。分叉复制截止所选已完成回复的历史，名称沿用 `Fork of …`，分支的新输入仍运行同一演示。11 个工具的名称、说明和参数在构建时取自本体；默认 9 个启用。另有 `web_search` 和 `web_fetch`，仅当联网插件和模拟服务都开启时标为启用。示例服务只使用 `demo` 占位符，不需要真实 API Key。`TaskOutput` 和 `TaskStop` 在协作或后台命令任一后端启用时可用。演示中默认开启上下文显示；在已完成回复后可查看模拟用量，并可在设置中关闭。

桌面、原文件树和终端共享浏览器虚拟文件系统。文件、任务、设置、草稿和历史只存在当前页内存；原组件的 Storage 接口在自己的 iframe 内使用临时实现。新开或刷新页面总是从空的 `/Users/demo/Desktop` 和默认字号开始，外观继承站点主题；只有这一项站点偏好持久化，不读取旧版保存的演示内容，也不清除同源的其他数据。

Dock 的访达和终端是独立的模拟 Mac 窗口。访达只有桌面和 Macintosh HD 两个入口，支持只读浏览、图标/列表视图、前进/后退和路径栏。文件打开在单独的“文本编辑”窗口，编辑同步到本页虚拟文件，不写入本机。桌面终端从虚拟主目录开始，提供分类帮助、命令历史及 Tab 命令/路径补全。标题栏双击与绿色按钮用于在虚拟桌面内最大化和还原。ZPI 右侧栏仍使用原 xterm 组件。两种终端共享的沙箱支持：`help`、`pwd`、`ls`、`cd`、`cat`、`mkdir`、`touch`、`mv`、`rm`、`echo`、`open`、`clear`、`date`、`whoami`。不会执行用户电脑上的 Shell。

**各产品的场景**：嵌入状态下的 Quick Chat 自动输入和提交不获取首页焦点，不滚动宿主页；点击演示后正常手动输入。Quick Chat 两个工具都关时翻译示例句；只开联网时展示 ZPI 仓库的 GitHub 来源；只开本机工具时仅清理未修改的虚拟 `snake.html`；两者都开时将双语项目卡片写到虚拟桌面。联网来源是预设，不做实时搜索。ZPI Agent SDK 无需输入参数，一秒后固定回复“你好，我是 zpi agent sdk。”。产品从 Dock 切换，菜单栏显示前台应用及仅作装饰的 File / Edit / View / Window；交互桌面不提供安装或重播入口；安装说明在独立介绍主页。

**模型目录**：`src/demo-models.ts` 按 ID 从本体 `packages/ai/src/providers/catalog.json` 读取四款 GPT 和 `deepseek-flash`，使用目录里的展示名、上下文与推理选项。

## 文件结构

```text
index.html                  产品介绍主页
src/home.ts / home.css       产品切换、安装说明与主页视觉
demo.html                   独立交互桌面外壳
zpi.html                    ZPI 原始入口容器
quick.html                  从原 Quick Chat HTML 生成
src/site.ts                 前台应用、桌面和快捷键路由
src/site.css                只作用于外部桌面，不进入产品 iframe
src/zpi-entry.ts             安装 bridge 后加载原始 main.tsx
src/desktop-bridge.ts        ZPI 本机接口、预设事件和虚拟文件适配
src/native-chrome.css        Electron 原生红黄绿按钮适配
src/quick-entry.ts           原始 Quick Chat renderer 的 bridge
src/quick-window.ts          原始窗口尺寸函数 + 浏览器窗口控制
src/shared.ts                两个 iframe 与桌面共享沙箱
js/core.js                  虚拟文件系统与可取消任务脚本
js/snake.js                 可独立运行的贪吃蛇 HTML
scripts/runtime.mjs         直接引用原仓库构建/开发
scripts/serve.cjs           生产产物静态预览
public/                     生成的原图标、PDF 资源与文档
dist/                       生成的部署产物
```

## 验证

```sh
npm test                    # 虚拟文件系统和任务取消单元测试
npm run build
npm run test:browser         # 对生产产物进行 Playwright 测试
npm run test:manuals         # 需要相邻 SDK 的 dist/：离线验证示例、静态链接和手册导航（端口 4181）
```

浏览器测试使用 ZPI 仓库的 Playwright，或通过 `CHROMIUM_PATH` 指定已有 Chromium。会自行启动 `127.0.0.1:4179`，完成后关闭；截图默认写到系统临时目录 `zpi-source-ui-tests`。

覆盖源码哈希、原始布局、全部设置分类、原始对话/预览、运行中操作、原 xterm/文件树、取消任务，以及 Quick Chat 的失焦/固定、快捷键、草稿、拖动、缩放、底部中心锚点和重开状态。

主页的安装命令用于本机终端；网页内的交互演示不需要安装或提供凭据。
