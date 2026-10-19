import QtQuick
import Quickshell
import Quickshell.Io
import qs.components
import qs.services

// Shown while `omarchy-update-available` succeeds, checked on Waybar's
// six-hour interval.
BarIcon {
    id: root

    property bool available: false

    visible: available
    text: Icons.update
    pixelSize: Theme.fontSize - 2
    tooltip: "Omarchy update available"
    onClicked: Quickshell.execDetached(["omarchy-launch-floating-terminal-with-presentation", "omarchy-update"])

    Process {
        id: check
        command: ["omarchy-update-available"]
        onExited: exitCode => root.available = exitCode === 0
    }

    Timer {
        interval: 6 * 60 * 60 * 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: check.running = true
    }
}
