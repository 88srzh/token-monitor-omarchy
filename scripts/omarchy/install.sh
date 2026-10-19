#!/bin/sh
# Sets up the Quickshell bar on Omarchy: links the shell config, installs the
# Hub and agent as systemd user services, adds a Hyprland autostart line and
# swaps the running Waybar for the bar. `--uninstall` reverses every step.
#
# Idempotent: re-running rewrites the units and the autostart line in place.
# See docs/omarchy.md.
set -eu

repo=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
config_home=${XDG_CONFIG_HOME:-$HOME/.config}
unit_dir=$config_home/systemd/user
shell_link=$config_home/quickshell/token-monitor
autostart=$config_home/hypr/autostart.conf
marker='# token-monitor-quickshell (managed by scripts/omarchy/install.sh)'
units='token-monitor-hub.service token-monitor-agent.service'

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

remove_autostart() {
    [ -f "$autostart" ] || return 0
    # Drop the marker and the line after it.
    awk -v marker="$marker" '$0 == marker { skip = 2 } skip > 0 { skip--; next } { print }' "$autostart" > "$autostart.tmp"
    mv "$autostart.tmp" "$autostart"
}

in_hyprland() { [ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; }

uninstall() {
    systemctl --user disable --now $units 2>/dev/null || true
    for unit in $units; do rm -f "$unit_dir/$unit"; done
    systemctl --user daemon-reload
    remove_autostart
    [ -L "$shell_link" ] && rm "$shell_link"
    if in_hyprland; then
        pkill -f 'qs -c token-monitor' 2>/dev/null || true
        if command -v omarchy-restart-waybar >/dev/null; then omarchy-restart-waybar
        else setsid -f uwsm-app -- waybar >/dev/null 2>&1; fi
    fi
    say 'Removed the bar, its services and the autostart line. Waybar is back.'
}

if [ "${1:-}" = '--uninstall' ]; then
    uninstall
    exit 0
fi
[ $# -eq 0 ] || die "usage: $0 [--uninstall]"

node=$(command -v node) || die 'Node.js 22.15+ is required (Omarchy: `mise use -g node@lts`).'
"$node" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 15) ? 0 : 1)' \
    || die "Node.js 22.15+ is required; $node is $("$node" --version)."
command -v qs >/dev/null || say 'warning: Quickshell (qs) is not installed yet: `yay -S quickshell`.'

if [ ! -d "$repo/node_modules" ]; then
    say 'Installing runtime dependencies (npm ci --omit=dev)…'
    (cd "$repo" && npm ci --omit=dev)
fi

# Shell config: a symlink, so `git pull` updates the bar too.
mkdir -p "$(dirname "$shell_link")"
if [ -e "$shell_link" ] && [ ! -L "$shell_link" ]; then
    die "$shell_link exists and is not a symlink; move it away first."
fi
ln -sfn "$repo/quickshell/token-monitor" "$shell_link"

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

# Autostart. Omarchy still launches Waybar from its own defaults; the bar
# stops it on start and after every theme or font change.
launch="uwsm-app -- env TOKEN_MONITOR_NODE=$node qs -c token-monitor"
mkdir -p "$(dirname "$autostart")"
touch "$autostart"
remove_autostart
printf '%s\nexec-once = %s\n' "$marker" "$launch" >> "$autostart"

if in_hyprland; then
    pkill -f 'qs -c token-monitor' 2>/dev/null || true
    TOKEN_MONITOR_NODE=$node setsid -f qs -c token-monitor >/dev/null 2>&1
    say 'The bar is running in place of Waybar.'
else
    say 'The bar starts with your next Hyprland session.'
fi
say "Services: systemctl --user status $units"
say "Dashboard: click the bar's Token Monitor icon, or bind \`qs -c token-monitor ipc call dashboard toggle\`."
