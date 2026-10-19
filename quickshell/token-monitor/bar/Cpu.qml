import QtQuick
import Quickshell
import Quickshell.Io
import qs.components
import qs.services

// Icon only, as in Waybar; the load is in the tooltip and a click opens btop.
BarIcon {
    id: root

    property int usage: 0
    property var previous: null

    text: Icons.cpu
    tooltip: "CPU " + usage + "%"
    onClicked: Quickshell.execDetached(["omarchy-launch-or-focus-tui", "btop"])

    Process {
        id: stat
        command: ["head", "-n", "1", "/proc/stat"]
        stdout: StdioCollector {
            onStreamFinished: root.sample(text)
        }
    }

    function sample(line) {
        const fields = line.trim().split(/\s+/).slice(1).map(Number);
        const idle = fields[3] + (fields[4] || 0);
        const total = fields.reduce((sum, value) => sum + value, 0);
        if (previous) {
            const spent = total - previous.total;
            usage = spent > 0 ? Math.round(100 * (1 - (idle - previous.idle) / spent)) : 0;
        }
        previous = { idle: idle, total: total };
    }

    Timer {
        interval: 5000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: stat.running = true
    }
}
