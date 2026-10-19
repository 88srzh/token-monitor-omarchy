//@ pragma UseQApplication

import QtQuick
import Quickshell
import Quickshell.Io
import qs.bar
import qs.dashboard
import qs.services

// Token Monitor for Omarchy: a Waybar replacement with the usage dashboard
// built in. Run with `qs -c token-monitor`; see docs/omarchy.md.
ShellRoot {
    id: root

    Variants {
        model: Quickshell.screens

        delegate: Bar {}
    }

    LazyLoader {
        active: TokenMonitor.dashboardOpen

        Dashboard {}
    }

    // Omarchy's defaults still launch Waybar, and its theme, font and toggle
    // commands relaunch it. This bar replaces it, so keep stopping it unless
    // TOKEN_MONITOR_KEEP_WAYBAR=1.
    Process {
        id: stopWaybar
        command: ["pkill", "-x", "waybar"]
    }

    Timer {
        interval: 5000
        running: Quickshell.env("TOKEN_MONITOR_KEEP_WAYBAR") !== "1"
        repeat: true
        triggeredOnStart: true
        onTriggered: stopWaybar.running = true
    }
}
