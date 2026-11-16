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

if ! git -C "$backend" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'error: no backend checkout at %s\n' "$backend" >&2
    printf 'The widget is updated; install the backend with:\n\n' >&2
    printf '  git clone https://github.com/88srzh/token-monitor-omarchy.git %s \\\n' "$backend" >&2
    printf '    && git -C %s checkout --detach %s \\\n' "$backend" "$revision" >&2
    printf '    && %s/scripts/omarchy/install.sh\n' "$backend" >&2
    exit 1
fi

git -C "$backend" fetch origin
git -C "$backend" checkout --detach "$revision"
exec "$backend/scripts/omarchy/install.sh"
