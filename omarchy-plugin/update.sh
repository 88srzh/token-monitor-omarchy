#!/bin/sh
set -eu

plugin_id=io.github.88srzh.token-monitor
plugin_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
backend=$HOME/.local/share/token-monitor

omarchy plugin update "$plugin_id" --yes
revision=$(git -C "$plugin_dir" show HEAD:README.md | sed -n 's/.*checkout --detach \([0-9a-f]\{40\}\).*/\1/p' | head -n 1)
if [ -z "$revision" ]; then
    printf 'error: the updated widget does not name a backend revision\n' >&2
    exit 1
fi

git -C "$backend" fetch origin
git -C "$backend" checkout --detach "$revision"
exec "$backend/scripts/omarchy/install.sh"
