#!/bin/sh
# Publishes omarchy-plugin/ to the widget's own repository, which
# `omarchy plugin add` and the plugin marketplace install from. The widget's
# README pins the backend to the main commit it was published from, by
# replacing @BACKEND_REV@ with that commit's full SHA. See docs/omarchy.md.
#
# Usage: scripts/omarchy/publish-plugin.sh [--dry-run]
set -eu

repo=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
plugin_repo=${TOKEN_MONITOR_PLUGIN_REPO:-https://github.com/88srzh/omarchy-token-monitor.git}

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

dry_run=0
case "${1:-}" in
    --dry-run) dry_run=1 ;;
    '') ;;
    *) die "usage: $0 [--dry-run]" ;;
esac

cd "$repo"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die 'publish from main.'
[ -z "$(git status --porcelain)" ] || die 'the checkout has uncommitted changes.'
git fetch --quiet origin main
rev=$(git rev-parse HEAD)
[ "$rev" = "$(git rev-parse origin/main)" ] || die 'main does not match origin/main; push or pull first.'
grep -q '@BACKEND_REV@' omarchy-plugin/README.md || die 'omarchy-plugin/README.md has no @BACKEND_REV@ to pin.'

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone --quiet "$plugin_repo" "$work/plugin"
# The published tree is exactly omarchy-plugin/, so deleted files go too.
git -C "$work/plugin" rm -r --quiet --ignore-unmatch .
cp -R omarchy-plugin/. "$work/plugin/"
sed "s/@BACKEND_REV@/$rev/g" omarchy-plugin/README.md > "$work/plugin/README.md"
git -C "$work/plugin" add -A
if git -C "$work/plugin" diff --cached --quiet; then
    echo "The plugin repository already matches $rev."
    exit 0
fi
git -C "$work/plugin" commit --quiet -m "Publish token-monitor-omarchy ${rev%"${rev#????????}"}" \
    -m "Widget and backend pin from 88srzh/token-monitor-omarchy@$rev."
git -C "$work/plugin" --no-pager show --stat --format='%h %s' HEAD
if [ "$dry_run" = 1 ]; then
    echo 'Dry run: not pushed.'
else
    git -C "$work/plugin" push --quiet origin HEAD:main
    echo "Published $(git -C "$work/plugin" rev-parse HEAD) with the backend pinned to $rev."
fi
