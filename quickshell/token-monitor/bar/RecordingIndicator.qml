import QtQuick
import Quickshell
import Quickshell.Io
import qs.components
import qs.services

// Red while gpu-screen-recorder runs; a click stops it through Omarchy.
BarIcon {
    id: root

    property bool recording: false

    visible: recording
    text: Icons.recording
    color: Theme.critical
    pixelSize: Theme.fontSize - 2
    leftMargin: 8.75
    rightMargin: 0
    tooltip: "Stop recording"
    onClicked: Quickshell.execDetached(["omarchy-cmd-screenrecord"])

    Process {
        id: probe
        command: ["pgrep", "-f", "^gpu-screen-recorder"]
        onExited: exitCode => root.recording = exitCode === 0
    }

    Timer {
        interval: 2000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: probe.running = true
    }
}
