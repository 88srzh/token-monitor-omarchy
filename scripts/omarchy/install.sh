#!/bin/sh
# Adds Token Monitor to the Omarchy 4 bar: installs the hub and agent as
# systemd user services and the bar widget as an omarchy-shell plugin.
# `--uninstall` reverses every step. See docs/omarchy.md.
#
# Idempotent: re-run it after `git pull` to refresh the plugin copy and units.
set -eu

repo=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
config_home=${XDG_CONFIG_HOME:-$HOME/.config}
unit_dir=$config_home/systemd/user
plugin_id=token-monitor
# omarchy-shell reads plugins from here regardless of XDG_CONFIG_HOME.
plugin_dir=$HOME/.config/omarchy/plugins/$plugin_id
units='token-monitor-hub.service token-monitor-agent.service'

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Not `omarchy-shell -q`: quiet mode reports success even with no shell.
shell_running() { command -v omarchy-shell >/dev/null && omarchy-shell shell ping >/dev/null 2>&1; }
plugin_has() {
    omarchy-shell shell listPlugins 2>/dev/null | jq -e --arg id "$plugin_id" "any(.[]; .id == \$id $1)" >/dev/null
}
plugin_enabled() { plugin_has 'and .enabled'; }

uninstall() {
    if shell_running; then
        plugin_enabled && omarchy-plugin-disable "$plugin_id" >/dev/null
        rm -rf "$plugin_dir"
        omarchy-shell shell rescanPlugins >/dev/null
    else
        rm -rf "$plugin_dir"
    fi
    systemctl --user disable --now $units 2>/dev/null || true
    for unit in $units; do rm -f "$unit_dir/$unit"; done
    systemctl --user daemon-reload
    say 'Removed the bar widget and the hub and agent services. Usage data in the checkout is kept.'
}

if [ "${1:-}" = '--uninstall' ]; then
    uninstall
    exit 0
fi
[ $# -eq 0 ] || die "usage: $0 [--uninstall]"

command -v omarchy-shell >/dev/null || die 'omarchy-shell not found: this needs Omarchy 4 or newer.'
node=$(command -v node) || die 'Node.js 22.15+ is required (`mise use -g node@lts`).'
"$node" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 15) ? 0 : 1)' \
    || die "Node.js 22.15+ is required; $node is $("$node" --version)."

if [ ! -d "$repo/node_modules" ]; then
    say 'Installing runtime dependencies (npm ci --omit=dev)…'
    (cd "$repo" && npm ci --omit=dev)
fi

# Services. Node's directory goes on PATH because the user manager starts with
# a minimal one, and Restart=always because both exit 0 on SIGTERM.
mkdir -p "$unit_dir"
node_dir=$(dirname "$node")
cat > "$unit_dir/token-monitor-hub.service" <<EOF
[Unit]
Description=Token Monitor hub

[Service]
WorkingDirectory=$repo
Environment=PATH=$node_dir:/usr/local/bin:/usr/bin:/bin
ExecStart=$node $repo/src/hub/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
cat > "$unit_dir/token-monitor-agent.service" <<EOF
[Unit]
Description=Token Monitor headless agent
Wants=token-monitor-hub.service
After=token-monitor-hub.service

[Service]
WorkingDirectory=$repo
Environment=PATH=$node_dir:/usr/local/bin:/usr/bin:/bin
ExecStartPre=$node $repo/scripts/ensure-vendored-tokscale.js
ExecStart=$node $repo/src/agent/agent.js
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now $units

# The plugin is a copy, not a symlink: Omarchy refuses symlinks in plugin
# folders, and the checkout cannot be the plugin folder itself because
# omarchy-shell reloads every plugin on any write under it, which the hub does
# on every ingest. local.json tells the copy where the bridge lives.
mkdir -p "$plugin_dir"
cp "$repo"/omarchy-plugin/* "$plugin_dir"/
"$node" -e 'process.stdout.write(JSON.stringify({ repoRoot: process.argv[1], node: process.argv[2] }, null, 2) + "\n")' \
    "$repo" "$node" > "$plugin_dir/local.json"

if shell_running; then
    omarchy-shell shell rescanPlugins >/dev/null
    # The rescan runs in the background; wait for the shell to know the plugin.
    tries=0
    until plugin_has '' || [ $tries -ge 20 ]; do sleep 0.5; tries=$((tries + 1)); done
    # Re-running keeps an enabled widget wherever it was moved to.
    if plugin_enabled; then
        say 'Updated the Token Monitor bar widget.'
    else
        omarchy-plugin-enable "$plugin_id" --section right
    fi
else
    say "omarchy-shell is not running; enable the widget later with: omarchy plugin enable $plugin_id"
fi
say "Services: systemctl --user status $units"
say "Panel: click the bar icon, or bind \`omarchy-shell $plugin_id toggle\`."
