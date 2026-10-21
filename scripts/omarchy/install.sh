#!/bin/sh
# Adds Token Monitor to the Omarchy 4 bar: installs the hub and agent as
# systemd user services, points the bar widget at this checkout, and adds the
# widget from its own repository with `omarchy plugin add`. `--uninstall`
# reverses every step. See docs/omarchy.md.
#
# Idempotent: re-run it after `git pull` to refresh the units and the widget.
set -eu

repo=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
config_home=${XDG_CONFIG_HOME:-$HOME/.config}
unit_dir=$config_home/systemd/user
# Read by the widget's Feed.qml, which builds the same path.
backend_config=$config_home/token-monitor-omarchy/backend.json
plugin_id=io.github.88srzh.token-monitor
plugin_url=https://github.com/88srzh/omarchy-token-monitor.git
# omarchy-shell reads plugins from here regardless of XDG_CONFIG_HOME.
plugins=$HOME/.config/omarchy/plugins
plugin_dir=$plugins/$plugin_id
# Before the widget had its own repository the installer copied it here.
legacy_id=token-monitor
legacy_dir=$plugins/$legacy_id
units='token-monitor-hub.service token-monitor-agent.service'

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Not `omarchy-shell -q`: quiet mode reports success even with no shell.
shell_running() { command -v omarchy-shell >/dev/null && omarchy-shell shell ping >/dev/null 2>&1; }
plugin_has() {
    omarchy-shell shell listPlugins 2>/dev/null | jq -e --arg id "$1" "any(.[]; .id == \$id $2)" >/dev/null
}
plugin_enabled() { plugin_has "$1" 'and .enabled'; }
# The shell rescans in the background; wait until it knows the plugin.
wait_for_plugin() {
    tries=0
    until plugin_has "$1" '' || [ $tries -ge 20 ]; do sleep 0.5; tries=$((tries + 1)); done
}

uninstall() {
    for id in "$plugin_id" "$legacy_id"; do
        [ -d "$plugins/$id" ] || continue
        shell_running && plugin_enabled "$id" && omarchy-plugin-disable "$id" >/dev/null
        rm -rf "${plugins:?}/$id"
    done
    shell_running && omarchy-shell shell rescanPlugins >/dev/null
    rm -f "$backend_config"
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

# The hub, agent and bridge share an owner-only secret from .env: without one
# the hub answers every local user, loopback or not. The host is pinned to
# loopback alongside it, since a hub with a secret otherwise binds every
# interface.
"$node" "$repo/scripts/omarchy/hubSecret.js" provision "$repo/.env"

# Services, which refuse to start without the secret. Before starting, each
# closes the usage data directories to other users (privateData.js), and its
# UMask keeps the files it creates there owner-only. Node's directory goes on
# PATH because the user manager starts with a minimal one, and Restart=always
# because both exit 0 on SIGTERM.
mkdir -p "$unit_dir"
node_dir=$(dirname "$node")
cat > "$unit_dir/token-monitor-hub.service" <<EOF
[Unit]
Description=Token Monitor hub

[Service]
WorkingDirectory=$repo
Environment=PATH=$node_dir:/usr/local/bin:/usr/bin:/bin
UMask=0077
ExecStartPre=$node $repo/scripts/omarchy/hubSecret.js require
ExecStartPre=$node $repo/scripts/omarchy/privateData.js
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
UMask=0077
ExecStartPre=$node $repo/scripts/omarchy/hubSecret.js require
ExecStartPre=$node $repo/scripts/omarchy/privateData.js
ExecStartPre=$node $repo/scripts/ensure-vendored-tokscale.js
ExecStart=$node $repo/src/agent/agent.js
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable $units
# A restart rather than `--now`, so running services pick up a new secret.
systemctl --user restart $units

# The widget finds this checkout and Node through backend.json.
mkdir -p "$(dirname "$backend_config")"
"$node" -e 'process.stdout.write(JSON.stringify({ repoRoot: process.argv[1], node: process.argv[2] }, null, 2) + "\n")' \
    "$repo" "$node" > "$backend_config"

if ! shell_running; then
    say "omarchy-shell is not running; once it is, re-run this script to add the widget."
    say "Services: systemctl --user status $units"
    exit 0
fi

# The widget is its own repository, as `omarchy plugin add` and the plugin
# marketplace expect. It cannot live in this checkout: omarchy-shell reloads
# every plugin on any write under its plugin folder, which the hub does on
# every ingest. Whether this run changes the QML the shell already has loaded:
changed=0
if [ -d "$plugin_dir/.git" ]; then
    before=$(git -C "$plugin_dir" rev-parse HEAD)
    omarchy-plugin-update "$plugin_id" --yes >/dev/null \
        || say "Could not update the widget; keeping the installed version."
    [ "$(git -C "$plugin_dir" rev-parse HEAD)" = "$before" ] || changed=1
elif [ -e "$plugin_dir" ]; then
    die "$plugin_dir exists but is not a git checkout; remove it and re-run."
else
    omarchy-plugin-add "$plugin_url" --yes >/dev/null
    changed=1
fi
omarchy-shell shell rescanPlugins >/dev/null
wait_for_plugin "$plugin_id"

# Move a copy left by an earlier installer over to the new id, in its place on
# the bar and with its period setting.
if [ -d "$legacy_dir" ] && [ ! -d "$legacy_dir/.git" ]; then
    if plugin_enabled "$legacy_id"; then
        plugin_enabled "$plugin_id" || omarchy-plugin-enable "$plugin_id" --after "$legacy_id" >/dev/null
        period=$(jq -r --arg id "$legacy_id" \
            '[.bar.layout[]?[]? | select(.id == $id) | .period // empty][0] // empty' \
            "$HOME/.config/omarchy/shell.json" 2>/dev/null || true)
        [ -z "$period" ] || omarchy-bar set "$plugin_id" period "$period" >/dev/null
        omarchy-plugin-disable "$legacy_id" >/dev/null
    fi
    rm -rf "$legacy_dir"
    omarchy-shell shell rescanPlugins >/dev/null
    say "Moved the widget from '$legacy_id' to '$plugin_id'."
    changed=1
fi

# Re-running keeps an enabled widget wherever it was moved to.
if plugin_enabled "$plugin_id"; then
    # omarchy-shell reloads a changed plugin, but its component-cache clear is
    # a no-op from QML, so the reload keeps the old Panel.qml. Only a fresh
    # shell picks the new one up.
    if [ "$changed" = 1 ] && command -v omarchy-restart-shell >/dev/null; then
        say 'Restarting omarchy-shell to load the updated widget…'
        omarchy-restart-shell
    else
        # Rereads backend.json and restarts the bridge on the current code.
        omarchy-shell token-monitor refresh >/dev/null 2>&1 || true
    fi
    say 'Updated the Token Monitor bar widget.'
else
    omarchy-plugin-enable "$plugin_id" --section right
fi
say "Services: systemctl --user status $units"
say "Panel: click the bar icon, or bind \`omarchy-shell token-monitor toggle\`."
