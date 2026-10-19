import QtQuick
import Quickshell
import qs.components
import qs.services

// The Token Monitor module: one glyph like its neighbours, tinted by the
// tightest quota and dimmed while the Hub is unreachable.
BarIcon {
    id: root

    required property ShellScreen screen
    readonly property var bar: TokenMonitor.model ? TokenMonitor.model.bar : null

    text: Icons.tokens
    color: bar ? Theme.toneColor(bar.tone) : Theme.foreground
    opacity: TokenMonitor.connected ? 1 : 0.5
    tooltip: TokenMonitor.connected && bar
        ? bar.tooltip
        : "Token Monitor\n" + (TokenMonitor.error || "connecting…")
    onClicked: TokenMonitor.toggleDashboard(screen)
}
