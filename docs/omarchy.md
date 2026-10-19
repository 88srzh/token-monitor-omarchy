# Omarchy bar (Quickshell)

On [Omarchy](https://omarchy.org) the usage display can live in the top bar instead of a floating window. `quickshell/token-monitor/` is a [Quickshell](https://quickshell.org) config that replaces Waybar: the stock Omarchy modules plus a Token Monitor icon that opens a full dashboard: today / month / all-time totals, AI tool limits, tool and model breakdowns, a 30-day chart, recent sessions, projects and devices.

```
agent (collects) ──POST /api/ingest──▶ hub :17321 ──SSE /api/stats/stream──▶ bridge.js ──JSON lines──▶ Quickshell
```

The Electron widget is untouched; the bar is one more Hub client.

## Requirements

- Omarchy (Hyprland, Wayland) with Waybar's default modules: the bar calls the same `omarchy-*` commands Waybar does.
- Quickshell 0.2 or newer (`yay -S quickshell`). It needs the `Quickshell.Bluetooth` module and `qs.*` imports, which 0.1 lacks.
- Node.js 22.15+ (`mise use -g node@lts`).

## Install

```bash
git clone https://github.com/88srzh/token-monitor-omarchy.git ~/.local/share/token-monitor
~/.local/share/token-monitor/scripts/omarchy/install.sh
```

The script is idempotent and changes only these things:

| What | Where |
|---|---|
| Runtime dependencies, if missing | `npm ci --omit=dev` in the checkout |
| Shell config, as a symlink so `git pull` updates the bar | `~/.config/quickshell/token-monitor` |
| Hub and agent as user services, enabled and started | `~/.config/systemd/user/token-monitor-{hub,agent}.service` |
| An autostart line between its own marker | `~/.config/hypr/autostart.conf` |

Inside a Hyprland session it also starts the bar right away. The agent's first start downloads the pinned tokscale binary (`ensure:tokscale`).

`scripts/omarchy/install.sh --uninstall` disables and removes the services, the symlink and the autostart line, then brings Waybar back.

## Configure

Hub, agent and bridge all read `.env` in the checkout (copy `.env.example`); see [configuration](configuration.md#headless-agent--hub-env). With no `.env` the Hub listens on `127.0.0.1:17321` without a secret and the agent and bridge use that address, which is the right setup for one machine. To show other devices, give the Hub a `TOKEN_MONITOR_SECRET` and point their agents or widgets at it. To follow an existing Hub or Worker instead, set `TOKEN_MONITOR_HUB_URL` and `TOKEN_MONITOR_SECRET` and disable the local hub service.

Restart the services after editing `.env`: `systemctl --user restart token-monitor-hub token-monitor-agent`. The bar's bridge rereads it when the bar restarts.

Environment for the bar itself, set on the autostart line:

| Variable | Effect |
|---|---|
| `TOKEN_MONITOR_NODE` | Node binary for the bridge. The installer pins the one it found, because the Hyprland session PATH may not include mise or nvm shims. |
| `TOKEN_MONITOR_ROOT` | Checkout to run the bridge from. Defaults to the directory the shell config symlink points into. |
| `TOKEN_MONITOR_KEEP_WAYBAR=1` | Do not stop Waybar (see below). |

## Use

- Click the Token Monitor icon to open the dashboard; Esc or a click elsewhere closes it, and `1` / `2` / `3` switch between Today, Month and All time.
- The icon turns amber when a fresh quota passes 80% and red past 95%, and dims while the Hub is unreachable. Its tooltip shows today's total and the tightest quota.
- Bind the dashboard to a key in `~/.config/hypr/bindings.conf`, picking a free chord:

  ```
  bind = SUPER CTRL, T, exec, qs -c token-monitor ipc call dashboard toggle
  ```

  `open` and `close` also exist, and `qs -c token-monitor ipc call theme reload` rereads the theme at once.

## How it fits Omarchy

- **Theme and font.** Colours come from `~/.config/omarchy/current/theme/waybar.css` and the font from `~/.config/waybar/style.css`, the files `omarchy-theme-set` and `omarchy-font-set` write. Both are re-read every 3 s rather than watched, because a theme switch changes what the `current/theme` path points at and an inotify watch on the old file never fires.
- **Waybar.** Omarchy's defaults launch Waybar at login, and its theme, font and toggle commands relaunch it. The bar runs `pkill -x waybar` every 5 s so two bars never stack; set `TOKEN_MONITOR_KEEP_WAYBAR=1` to opt out.
- **Network.** The network module reads sysfs and `/proc/net/wireless` (`bar/network-status.sh`) rather than a network manager, since Omarchy uses iwd. Only interfaces backed by a device count, so docker, veth and tunnel interfaces are ignored.

## Why a Node bridge

QML cannot load the shared UMD modules in `src/shared/`: its global object is read-only and they `require` one another. Reimplementing their labels, limit wording and number formatting in QML would duplicate exactly the display rules every other surface shares. `src/quickshell/bridge.js` follows the Hub stream instead, and `src/quickshell/dashboardModel.js` turns each snapshot into display rows with those shared helpers, under node:test. The QML lays out what it receives and computes nothing but geometry. Keep it that way: a new figure on the dashboard belongs in `dashboardModel.js` first.

The bridge also keeps the Hub secret off the command line: it reads `.env` itself and sends the secret as a header, because every argument of a process in the session is visible in `ps`.

## Troubleshooting

- **Icon dimmed, "Offline" in the dashboard.** Check the services with `systemctl --user status token-monitor-hub token-monitor-agent` and their logs with `journalctl --user -u token-monitor-agent -f`. The dashboard header shows the bridge's last error.
- **"bridge exited".** The bridge could not start: usually `TOKEN_MONITOR_NODE` points at a Node that no longer exists, or `npm ci` was not run.
- **Bar does not start, or a module is missing.** Run `qs -c token-monitor` in a terminal to see QML errors; an older Quickshell fails on the `Quickshell.Bluetooth` import.
