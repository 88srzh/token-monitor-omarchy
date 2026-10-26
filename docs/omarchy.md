# Omarchy bar widget

On [Omarchy](https://omarchy.org) 4 the top bar is `omarchy-shell`, a Quickshell host that loads bar widgets as plugins. `omarchy-plugin/` is a Token Monitor bar widget for it: one icon in the bar, like Omarchy's own, and a panel that follows the Electron widget's home view: today / month / all-time totals, AI tool limits (only accounts with a reading: unconfigured or signed-out ones are left out, and after a failed refresh the last reading stays, dimmed and marked stale), tool, model and project breakdowns, a rolling-year activity grid and trend line, recent sessions with their model and prompt-cache countdown, and devices. It sits next to Omarchy's built-in `omarchy.agents` widget and covers every tool and device the Token Monitor hub knows about.

```
agent (collects) ──POST /api/ingest──▶ hub :17321 ──SSE /api/stats/stream──▶ bridge.js ──JSON lines──▶ omarchy-shell widget
                                                  └──GET /api/history (on revision change)──┘
```

The stats snapshot carries only a 30-day history preview, so the bridge also reads `/api/history` for the activity grid: once at start and again whenever the snapshot's `historyRevision` moves. Until that answers, and if it fails, the panel draws from the preview.

The Electron widget is untouched; the bar widget is one more Hub client.

## Requirements

- Omarchy 4 or newer (`omarchy-shell`).
- Node.js 22.15+ (`mise use -g node@lts`).

## Install

```bash
git clone https://github.com/88srzh/token-monitor-omarchy.git ~/.local/share/token-monitor
~/.local/share/token-monitor/scripts/omarchy/install.sh
```

The script is idempotent; re-run it after `git pull`. It adds the widget from its own repository, [88srzh/omarchy-token-monitor](https://github.com/88srzh/omarchy-token-monitor), with `omarchy plugin add`, and on later runs updates it with `omarchy plugin update`. When the widget changed, it restarts `omarchy-shell` (`omarchy-restart-shell`): the shell does reload a changed plugin, but its component-cache clear does nothing when called from QML, so the reload keeps showing the old panel. It changes only these things:

| What | Where |
|---|---|
| Runtime dependencies, if missing | `npm ci --omit=dev` in the checkout |
| A random hub secret and a loopback host, if not set, in an owner-only file | `.env` in the checkout (`TOKEN_MONITOR_SECRET`, `TOKEN_MONITOR_HOST=127.0.0.1`, mode 600) |
| Hub and agent as user services, enabled and started | `~/.config/systemd/user/token-monitor-{hub,agent}.service` |
| Usage data closed to other users, by each service for the directory it writes, before it starts, and through its `UMask=0077`. A file an earlier install left readable is replaced by an owner-only copy, not chmodded, so a descriptor opened on it earlier never sees later writes | `data/` in the checkout (hub) and `~/.config/Token Monitor/` (agent: the session archive and its SQLite sidecars), mode 700 with owner-only files |
| The checkout path and Node binary, for the widget | `~/.config/token-monitor-omarchy/backend.json` |
| The widget, a clone of its repository | `~/.config/omarchy/plugins/io.github.88srzh.token-monitor/` |
| The widget enabled in the bar's right section, on first install | `~/.config/omarchy/shell.json`, through `omarchy plugin enable` |

Installs from before the widget had its own repository kept a copy under the id `token-monitor`. The installer moves that to the new id in the same place on the bar, keeps its period setting and deletes the copy.

The widget can also be added on its own, with `omarchy plugin add` or from the [Omarchy plugin marketplace](https://plugins.omarchy.org). It then shows "backend not installed" until the installer above runs, which leaves it where it is on the bar.

The agent's first start downloads the pinned tokscale binary (`ensure:tokscale`).

`scripts/omarchy/install.sh --uninstall` disables the widget, deletes its plugin folder and `backend.json`, and removes the services. Usage data stays in the checkout.

## Configure

Hub, agent and bridge all read `.env` in the checkout (copy `.env.example`); see [configuration](configuration.md#headless-agent--hub-env). The installer gives every install a secret: without one the Hub accepts any request, and listening on `127.0.0.1` only keeps other machines out, not other users of this one, who could read the device records or delete them. It writes a random `TOKEN_MONITOR_SECRET` into `.env` when none is set, makes the file readable by its owner only, and pins `TOKEN_MONITOR_HOST=127.0.0.1`, because a Hub with a secret otherwise listens on every interface. The hub and agent services refuse to start while `.env` gives no secret (`scripts/omarchy/hubSecret.js require`). The agent and bridge read the same file, so one machine needs nothing more. To show other devices, set `TOKEN_MONITOR_HOST=0.0.0.0` and point their agents or widgets at this Hub with its secret. To follow an existing Hub or Worker instead, set `TOKEN_MONITOR_HUB_URL` and that Hub's `TOKEN_MONITOR_SECRET` (replacing the generated one) and disable the local hub service.

After editing `.env`, restart the services (`systemctl --user restart token-monitor-hub token-monitor-agent`) and the bridge (right-click the bar icon, or press `r` in the panel).

The widget has one setting, the period the panel opens on: `omarchy bar set io.github.88srzh.token-monitor period month` (`today`, `month` or `allTime`).

## Use

- Left click opens the panel; right click reconnects to the Hub.
- The icon takes Omarchy's alarm colour once a fresh quota passes 90%, the same threshold as `omarchy.agents`, and dims while the Hub is unreachable. Its tooltip shows today's total and the tightest quota.
- In the panel: `h` / `l` or `1` / `2` / `3` switch period, `j` / `k` scroll, `r` reconnects, Tab moves to the neighbouring bar panel, Esc closes.
- IPC: `omarchy-shell token-monitor <open|close|toggle|refresh>`; bind `toggle` in `~/.config/hypr/bindings.conf` to summon the panel from the keyboard.

## Why the widget is its own repository

`omarchy-shell` watches `~/.config/omarchy/plugins/` recursively and reloads every plugin on any write under it, and the Hub writes into the checkout on every ingest, so the checkout cannot be the plugin folder. Omarchy also refuses symlinks inside plugin folders, and `omarchy plugin add` and the marketplace take one repository with `manifest.json` at its root. So `omarchy-plugin/` is published on its own, and the installer writes `backend.json` with the checkout path and the Node binary, outside the plugin folder, for `Feed.qml` to start the bridge from. The widget's reconnect (right click, `r`, the `refresh` IPC call) rereads it.

`omarchy-plugin/` stays the source: its tests run here against the bridge and model it depends on. `scripts/omarchy/publish-plugin.sh` publishes it from a clean `main` that matches `origin/main`: it copies the folder into a clone of the plugin repository, replaces `@BACKEND_REV@` in its README with the full SHA of that `main` commit, and pushes one commit on top, so `omarchy plugin update` can fast-forward.

The SHA is there for the marketplace review: the widget's README installs and updates the backend by checking out that exact commit in detached mode rather than running whatever the default branch holds, so a listing reviewed at one plugin commit installs the backend revision reviewed with it. A widget and the backend from the same `main` commit also always match. This checkout's own install (`git pull` on `main`, then the installer) is unaffected.

Publish after merging a change to `omarchy-plugin/` or to anything the backend runs, and before anyone re-runs the installer, which pulls the published widget rather than the checkout's copy. Every published commit leaves the marketplace listing "Update unverified" until it is submitted again through the marketplace's plugin verification form. Keep the plugin id: marketplace ids are permanent, and the installer, `Feed.qml`'s `backend.json` path and the tests all name it.

## Why a Node bridge

QML cannot load the shared UMD modules in `src/shared/`: its global object is read-only and they `require` one another. Reimplementing their labels, limit wording and number formatting in QML would duplicate exactly the display rules every other surface shares. `src/quickshell/bridge.js` follows the Hub stream instead, and `src/quickshell/dashboardModel.js` turns each snapshot into display rows with those shared helpers, under node:test. The activity grid, trend path and session model label come from the Electron renderer's own modules (`usageCharts.js`, `homeOverview.js`, `sessionRows.js`), which are UMD and DOM-free, so the panel and the Electron home view lay them out from the same rules; the trend reaches QML as a path in 0..1 units that it only scales. The QML lays out what it receives and computes nothing but geometry. Keep it that way: a new figure in the panel belongs in `dashboardModel.js` first.

The bridge also keeps the Hub secret off the command line: it reads `.env` itself and sends the secret as a header, because every argument of a process in the session is visible in `ps`.

## Troubleshooting

- **Icon dimmed, "No data" in the panel.** Check the services with `systemctl --user status token-monitor-hub token-monitor-agent` and their logs with `journalctl --user -u token-monitor-agent -f`. The panel header shows the bridge's last error.
- **"backend not installed" or "bridge exited".** `backend.json` is missing or points at a Node or checkout that moved; re-run the installer.
- **The panel still looks like the previous version after an update.** The shell is holding the old QML; run `omarchy-restart-shell`. The shell log shows it as a warning from a line of `Panel.qml` that no longer matches the file on disk.
- **No icon in the bar.** `omarchy plugin list` should show `io.github.88srzh.token-monitor` as enabled; `omarchy plugin enable io.github.88srzh.token-monitor --section right` places it. QML errors show in the shell's log: `quickshell log -p "$OMARCHY_PATH/shell" --any-display --tail 200 | grep -i token-monitor`.
