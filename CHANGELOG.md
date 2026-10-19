# dsh-purge `1.1.72-dsh021rc2.1` — DSH 0.2.1-rc.2 适配版

基座：`YuJunZhiXue/dsh-purge` **master @ 1.1.72**（上游最后一个未发布版本，tag 停在 v1.1.71）。
目标宿主：`@deepseek-ai/dsh` / `dsh-base` **0.2.1-rc.2**（macOS，web profile，npx 安装）。
产出：`dist/dsh-purge-1.1.72-dsh021rc2.1.tgz`（2.0 MB，114 files）。

## 一、修了什么（逐条对应 issue）

| # | 问题 | 根因 | 改动 |
|---|------|------|------|
| **#114 / #126 / #136** | 每轮对话必炸 `unknown prompt variable "{{cwd}}"` | 0.2.1 的 agent-loop 只注册 `provider`/`model` 两个 prompt 变量；`identity.js` 无条件把 `deployment:persona-suffix` 换成 `Your working directory is {{cwd}}.` | `lib/identity.js` 增加能力探测 `cwdVariableSupported()`：`assembled.variables` 里没有 `cwd` 就改用静态文案 `Your working directory is the current workspace.`；组装末尾再把任何残留 `{{cwd}}` 落成字面量。支持 `DSH_PURGE_CWD=variable|static` 强制。 |
| 同上（第二处） | — | 插件自己的 `cordis.patch.yml` 里也写着 `personaSuffix: ... {{cwd}}.` | 改成 `personaSuffix: ""`，后缀统一由 identity 层在组装期决定（与社区 1.6.28 一致）。 |
| **#132** | 点「应用」后 `清洗没有写进全部宿主，已取消重启`；补丁 #40 状态 `skipped` | 0.2.1 的 `system-prompt` 在 assemble 后新增了 `requiredContexts` 过滤，patch #40 的 7 条 pattern 全部不命中 | `lib/core.js` patch #40 新增 0.2.1 形状 pattern + 对应 replacement，保留 `requiredContexts` 语义，并写入 `fold-complete inject first` 标记。 |
| **#119** | 官方桌面端点「应用」后 `dsh: fatal load failure` | `desktop.js` 的 `repairOfficialCliAfterUnpack()` 是同步函数，却调用 async `atomicCopyFile()` 且没 `await`；Node 24 把 unhandled rejection 升级成 uncaughtException | 函数改 `async`，补 `await`；`core.js` 两个调用点、`index.js` 的 apply 路径同步改 `await`。 |
| **#127 / #106** | 应用后一份 `.bak` 都没有，还原/卸载失效 | `extract-asar.js` 的 `HOST_SYNC` 白名单漏了 `closeSync`，`hostFs.closeSync` 为 `undefined`，`backupAll()` 的占位句柄永不释放 → Windows EPERM 静默失败 | 白名单补 `closeSync / fsyncSync / truncateSync / writeSync / futimesSync / utimesSync`。 |
| **#121**（上游已修，本版确认） | Ctrl+Enter 插话静默失效 | 1.1.71 的 patch #86 把 `case "steer"` 改成 `agent.followup`，与 `steer()` 的 next-step 语义打架 | 1.1.72 已把它重写为 `agent.steer`；本版在真实宿主上验证落盘（`dsh-api-session-controller/lib/index.js:1049`）。 |
| 社区 plus 的修法（luowang） | 红队预设注册失败 | `presets/redteam/agent.cordis.yml` 的 `toolFilter.deny` 列了 `subagent_fork / workflow / ralph`；0.2.1 的 `tools.restrict()` 会校验"必须是已注册全局工具"，`workflow`/`ralph` 在本 profile 无注册 → 抛 `unknown global tool` | 移除 `toolFilter` 块，隔离改由 `maxDepth: 1` 保证（与 plus 1.6.1 同处理）。 |
| 元数据 | — | `dshTarget` 还写 0.2.0-rc.2 | 改为 `0.2.1-rc.2`，版本号 `1.1.72-dsh021rc2.1`。 |

未处理（有意）：#133（Windows 桌面换包助手杀自己）— 纯 Windows/Electron 路径，本机 macOS 不复现，未改；上游 #30（system section 过滤吃掉项目约定）属行为争议，不在适配范围。

## 二、验证

1. **单元测试**（`test/identity.test.mjs`，5 项全过）
   用真实宿主规则回放插值：`{{name}}` 未注册即抛错。断言在 `variables={provider,model}` 下输出不含 `{{cwd}}`，在 `variables` 带 `cwd` 时保留变量，注入文本里的 `{{cwd}}` 也被中和。
2. **补丁测试**（`test/patches.test.mjs`，5 项全过）
   拿官方快照 `dsh-system-prompt/lib/index.js.dshpurge.bak` 当"改前"样本，patch #40 命中、产物 `node --check` 通过、二次应用幂等；#86 把 `agent.followup` 改回 `agent.steer`；#119/#127/预设静态断言通过。
3. **沙箱全量 dry-run**（`test/sandbox-apply.mjs`）
   把 52 个宿主目标文件复制到 `/tmp`，跑完整 apply：70 个补丁 settled、#40 = applied、改动文件全部 `node --check` 通过。
4. **真实宿主 apply**（已执行）
   - 应用前：59/86，11 pending（#40 为 skipped）
   - 应用后：**70/86，0 pending**，#40 / #85 / #86 / #87–#92 全部 applied
   - `hostCleanMarkersPresent(...) === true`、`hostPromptKeepsInject(...) === true`（不会再因"清洗没写进宿主"取消重启）
   - 宿主侧落盘核对：`dsh-system-prompt/lib/index.js` 保留 `requiredContexts` 且写入 `fold-complete inject first`；`dsh-api-session-controller/lib/index.js:1049` 为 `agent.steer(message)`；三个关键文件 `node --check` 全过
5. **备份**
   - 应用前宿主 52 个目标文件快照：`snapshots/host-before-apply-20261019-183407.tgz`
   - 宿主逐文件官方快照：51 个 `*.dshpurge.bak`（插件机制）
   - 旧插件目录：`~/.dsh/profiles/web/node_modules/dsh-purge.1.1.66.bak`

## 三、安装 / 回滚

```sh
# 安装（已在 web profile 执行过）
cd ~/Documents/dsh-purge-1.1.72-rc2
./install.sh

# 回滚插件
rm -rf ~/.dsh/profiles/web/node_modules/dsh-purge
mv ~/.dsh/profiles/web/node_modules/dsh-purge.1.1.66.bak ~/.dsh/profiles/web/node_modules/dsh-purge

# 回滚宿主补丁（三选一）
# 1) 用插件自己的还原：重启后点 Purge → 还原
# 2) 解包快照（绝对路径 tar）：
tar xzf snapshots/host-before-apply-20261019-183407.tgz -C /
# 3) 逐个 .dshpurge.bak 覆盖回去
```

## 四、必须重启

补丁改的是宿主已加载的 JS 文件，当前进程仍跑旧代码；**完全退出并重开 DSH** 后生效。
重开后确认：Purge 面板应为 `86` 个补丁位、`0 pending`、版本 `1.1.72-dsh021rc2.1`。
