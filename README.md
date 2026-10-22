# dsh-purge · DSH 0.2.1 兼容分支

修复每轮对话在发送模型请求前报 `unknown prompt variable "{{cwd}}"` 的问题。**只更新插件，不升级 harness。**

- 当前版本：`1.1.72-dsh021rc2.5`
- 基于 [evilevil/dsh-purge-021rc2](https://github.com/evilevil/dsh-purge-021rc2)；原项目为 [小杨 / YuJunZhiXue 的 dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)。保留双方版权和 MIT 许可证。
- 实测环境：DSH Desktop **0.12.1 / macOS ARM64 / web profile**，内置 harness **0.2.1-rc.2**。

## 安装并恢复对话

### 优先使用插件管理器

在 DSH 的 **Plugins → Add plugin → Install a third-party plugin** 中填写这个固定版本的包规格（保留 `dsh-purge@`，用于替换已有依赖）：

```text
dsh-purge@https://github.com/Subaru486desuwa/dsh-purge-021rc2/releases/download/v1.1.72-dsh021rc2.5/dsh-purge-1.1.72-dsh021rc2.5.tgz
```

如果有 `dsh` 命令，也可以在对应的 `DSH_HOME` 下执行：

```sh
dsh plugin --profile web add dsh-purge@https://github.com/Subaru486desuwa/dsh-purge-021rc2/releases/download/v1.1.72-dsh021rc2.5/dsh-purge-1.1.72-dsh021rc2.5.tgz
```

这条路径由宿主管理依赖和锁文件，避免下次维护 profile 时重新装回旧插件。更换前请备份现有插件目录、profile 的 `package.json` 和锁文件。

安装后完全退出并重开 DSH，然后发送一条短消息。**仅修复 cwd 报错，不需要点击 Purge 的「应用」**；该按钮会写入整套宿主补丁，与这次提示词兼容修复是两件事。

插件自动更新和自动应用补丁默认关闭。本分支不修改 API 地址、模型配置、凭据、项目规则或用户的 `prompt-inject.md`。

### 手工替换已有插件

没有插件管理器时，下载固定版本脚本，查看后执行：

```sh
curl -fsSL https://raw.githubusercontent.com/Subaru486desuwa/dsh-purge-021rc2/v1.1.72-dsh021rc2.5/scripts/install.sh -o install-dsh-purge.sh
# 查看脚本，并先完全退出 DSH。
DSH_HOME="$HOME/Library/Application Support/dsh-desktop/harness" \
  PURGE_VERSION=1.1.72-dsh021rc2.5 sh install-dsh-purge.sh
```

脚本验证发行包校验和、名称、版本和入口后才替换插件，并留下 `dsh-purge.<时间>.<pid>.bak`。它不写入 `applied.json` 或 `installed-rev`，不应用宿主补丁，也不修改 profile 依赖与锁文件。需要持久锁定版本时，使用上面的插件管理器路径。

未指定 `DSH_HOME` 时，优先保留已有 `~/.dsh` web profile；该目录不存在时才尝试 DSH Desktop 的默认目录。多个安装并存时请明确指定。

### 回滚

完全退出 DSH。若通过插件管理器安装，用同一入口安装此前保留的插件发行包，并恢复对应的 profile 依赖和锁文件；若通过手工脚本安装，把当前插件目录移到隔离目录，再把脚本留下的 `.bak` 移回 `profiles/web/node_modules/dsh-purge`。重开后验证对话。

这次兼容修复不要求改写 harness，因此无需回滚 harness。

## 修复范围

DSH 0.2.1 的 agent loop 只注册 `provider`、`model`。工作目录由 `working-directory:current` 动态上下文提供，不再有内置 `{{cwd}}` 变量。

继承社区版的能力探测：旧宿主注册了 `cwd` 就继续使用变量；新宿主改用静态后缀，并清理可插值段里的遗留 `{{cwd}}`。本分支补充：

- **保留字面量正文**：`interpolate: false` 的提示词不替换 `{{cwd}}`，避免改写用户示例；真实工作目录仍由宿主上下文提供。
- **正确定位桌面安装**：支持带空格的自定义 `DSH_HOME`，不再把安装状态误写到 `~/.dsh`。
- **安装失败不破坏旧插件**：先完整解包和检查，再移动旧目录；失败时保留或恢复旧插件。不伪造“补丁已应用”状态。
- **更新源保持在本 fork**：面板检查、下载和版本切换使用本仓库的 `main` / tags，不会重新装回旧上游。
- **可运行的发布检查**：离线测试不依赖维护者的个人路径；可对指定安装包快照运行真实提示词渲染回放。

社区版继承的其他改动见 [CHANGELOG.md](CHANGELOG.md)。本分支没有重新实现这些修复。

## 开发和验证

Node.js ≥18，无需安装运行时依赖即可执行：

```sh
npm test
```

提供已安装宿主的只读 `@deepseek-ai` 目录，可进一步验证真实渲染器和补丁匹配；未提供时离线套件会明确跳过宿主样本检查：

```sh
export PURGE_HOST=/path/to/node_modules/@deepseek-ai
npm test
node test/desktop-prompt.mjs
# 需要验证整套既有补丁时：只会修改临时副本。
node test/sandbox-apply.mjs
```

本版已在 DSH Desktop 0.12.1 的原失败会话中完成真实请求：3 秒返回预期验收文本。未升级 harness，也未点击整套宿主补丁的「应用」。

测试、构建、Git 操作在 Linux 上进行；桌面启动和真实对话验收在 macOS 上进行。Windows 路径未在本分支验证。

## 维护和发版

问题跟踪使用[本仓库 GitHub Issues](https://github.com/Subaru486desuwa/dsh-purge-021rc2/issues)，兼容说明放在 `docs/`，版本记录放在 `CHANGELOG.md`。

1. 更新代码、测试、`package.json` 版本和安装 URL、CHANGELOG。
2. 执行 `npm test`；宿主契约有变化时同时运行真实渲染回放。
3. 推送 `v<package.json.version>` tag；Release workflow 检查后生成 `.tgz` 和用于下载完整性校验的 `SHA256SUMS.txt`。

## 来源与许可

- 原作者：**小杨 / [YuJunZhiXue](https://github.com/YuJunZhiXue/dsh-purge)**。
- 社区 0.2.1 适配：**[evilevil](https://github.com/evilevil/dsh-purge-021rc2)**。
- 本分支：**[Subaru486desuwa](https://github.com/Subaru486desuwa/dsh-purge-021rc2)**，桌面安装、字面量提示词兼容与验证。
- MIT；版权声明见 [LICENSE](LICENSE)。原始说明保留于 `upstream-README*.md`。
