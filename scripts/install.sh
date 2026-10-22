#!/bin/sh
# Replace an existing web-profile plugin; never apply host patches or forge stamps.
# Prefer the DSH plugin manager to persist the release URL in profile dependencies.
set -eu

REPO="Subaru486desuwa/dsh-purge-021rc2"
VERSION="${PURGE_VERSION:-}"
say() { printf '%s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

if [ -z "${DSH_HOME:-}" ]; then
  DSH_HOME="$HOME/.dsh"
  DESKTOP_HOME="$HOME/Library/Application Support/dsh-desktop/harness"
  if [ ! -d "$DSH_HOME/profiles/web/node_modules" ] && [ -d "$DESKTOP_HOME/profiles/web/node_modules" ]; then
    DSH_HOME="$DESKTOP_HOME"
  fi
fi
DEST="$DSH_HOME/profiles/web/node_modules"
TARGET="$DEST/dsh-purge"
command -v curl >/dev/null 2>&1 || die "需要 curl"
command -v python3 >/dev/null 2>&1 || die "需要 python3"
command -v shasum >/dev/null 2>&1 || die "需要 shasum"
[ -d "$DEST" ] || die "找不到 profile 目录：$DEST（请设置正确的 DSH_HOME）"

if [ -z "$VERSION" ]; then
  say "→ 查询最新发行版…"
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"].removeprefix("v"))')
  [ -n "$VERSION" ] || die "无法确定最新版本，可显式指定 PURGE_VERSION"
fi
case "$VERSION" in *[!a-zA-Z0-9.+-]*|'') die "无效版本号";; esac
BASE="https://github.com/$REPO/releases/download/v$VERSION"
TGZ="dsh-purge-$VERSION.tgz"
TMP=$(mktemp -d "$DEST/.dsh-purge-install.XXXXXX")
BAK=""
INSTALLED=0
cleanup() {
  result=$?
  if [ "$INSTALLED" -eq 0 ] && [ -n "$BAK" ] && [ ! -e "$TARGET" ] && [ ! -L "$TARGET" ]; then
    mv "$BAK" "$TARGET" || say "恢复失败，请将 $BAK 移回 $TARGET" >&2
  fi
  rm -rf "$TMP"
  trap - 0
  exit "$result"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM

say "→ 下载 $TGZ"
curl -fsSL "$BASE/$TGZ" -o "$TMP/$TGZ" || die "下载失败：$BASE/$TGZ"
curl -fsSL "$BASE/SHA256SUMS.txt" -o "$TMP/SHA256SUMS.txt" || die "校验文件下载失败"
say "→ 校验 SHA256"
(cd "$TMP" && grep " $TGZ\$" SHA256SUMS.txt > sums.txt && shasum -a 256 -c sums.txt >/dev/null) \
  || die "SHA256 校验失败"
mkdir "$TMP/package"
tar xzf "$TMP/$TGZ" -C "$TMP/package" --strip-components=1
python3 - "$TMP/package" "$VERSION" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
metadata = json.loads((root / 'package.json').read_text())
if metadata.get('name') != 'dsh-purge' or metadata.get('version') != sys.argv[2] or not (root / 'lib/index.js').is_file():
    raise SystemExit('发行包名称、版本或入口不匹配；原插件未改动')
PY
if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  BAK="$TARGET.$(date +%Y%m%d-%H%M%S).$$.bak"
  say "→ 备份现有插件到 $BAK"
  mv "$TARGET" "$BAK"
fi
mv "$TMP/package" "$TARGET"
INSTALLED=1
say "✓ 已安装 dsh-purge $VERSION → $TARGET"
say "  原有 applied.json / installed-rev 保持不变；没有应用宿主补丁。"
say "  完全退出并重开 DSH 后验证对话；仅修 cwd 无需点击「应用」。"
say "  此脚本不修改 profile 依赖；需持久锁定版本时使用 README 中的插件管理器安装方式。"
