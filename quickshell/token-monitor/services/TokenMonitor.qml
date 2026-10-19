pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io

// The Hub feed. Runs src/quickshell/bridge.js and keeps its latest line: the
// bridge has already turned the stats snapshot into display rows, so nothing
// here interprets usage data.
Singleton {
    id: root

    // ~/.config/quickshell/token-monitor is a symlink into the checkout, and
    // `..` resolves against the real directory, so this reaches the repo root.
    readonly property string repoRoot: Quickshell.env("TOKEN_MONITOR_ROOT") || (Quickshell.shellDir + "/../..")
    readonly property string bridgeScript: repoRoot + "/src/quickshell/bridge.js"

    property var model: null
    property bool connected: false
    property string error: ""
    property string hubUrl: ""

    property bool dashboardOpen: false
    property var dashboardScreen: null
    property string period: "today"
    property double closedAt: 0

    readonly property var current: model ? model.periods[period] : null

    function openDashboard(screen) {
        dashboardScreen = screen || focusedScreen();
        dashboardOpen = true;
    }

    function closeDashboard() {
        if (!dashboardOpen) return;
        dashboardOpen = false;
        closedAt = Date.now();
    }

    function toggleDashboard(screen) {
        // A click on the bar button first clears the dashboard's focus grab;
        // without this the same click would reopen what it just closed.
        if (!dashboardOpen && Date.now() - closedAt < 300) return;
        if (dashboardOpen) closeDashboard();
        else openDashboard(screen);
    }

    function focusedScreen() {
        const name = Hyprland.focusedMonitor ? Hyprland.focusedMonitor.name : "";
        const screens = Quickshell.screens;
        for (let index = 0; index < screens.length; index += 1) {
            if (screens[index].name === name) return screens[index];
        }
        return screens.length ? screens[0] : null;
    }

    function handleLine(line) {
        let message;
        try {
            message = JSON.parse(line);
        } catch (_) {
            return;
        }
        hubUrl = message.hubUrl || hubUrl;
        if (message.type === "model") {
            model = message.model;
            connected = true;
            error = "";
        } else if (message.type === "status") {
            connected = false;
            error = message.error || "hub unreachable";
        }
    }

    Process {
        id: bridge
        running: true
        // TOKEN_MONITOR_NODE lets the autostart line pin a Node that is not on
        // the session PATH (mise, nvm).
        command: ["sh", "-c", "exec \"${TOKEN_MONITOR_NODE:-node}\" \"$1\"", "sh", root.bridgeScript]
        stdout: SplitParser {
            onRead: data => root.handleLine(data)
        }
        stderr: SplitParser {
            onRead: data => console.warn("token-monitor bridge:", data)
        }
        onExited: (exitCode, exitStatus) => {
            root.connected = false;
            root.error = "bridge exited with code " + exitCode;
            restart.start();
        }
    }

    Timer {
        id: restart
        interval: 5000
        onTriggered: bridge.running = true
    }

    IpcHandler {
        target: "dashboard"

        function toggle(): void {
            root.toggleDashboard(null);
        }

        function open(): void {
            root.openDashboard(null);
        }

        function close(): void {
            root.closeDashboard();
        }
    }
}
