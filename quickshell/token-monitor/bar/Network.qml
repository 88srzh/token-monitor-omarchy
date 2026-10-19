import QtQuick
import Quickshell
import Quickshell.Io
import qs.components
import qs.services

// Polls network-status.sh, which reads sysfs rather than a network manager.
BarIcon {
    id: root

    property string kind: "disconnected"
    property int quality: 0
    property string iface: ""

    leftMargin: 0
    rightMargin: 13
    text: kind === "wifi"
        ? Icons.wifi[Math.min(Icons.wifi.length - 1, Math.floor(quality / 100 * Icons.wifi.length))]
        : kind === "ethernet" ? Icons.ethernet : Icons.networkOff
    tooltip: kind === "wifi" ? iface + "  " + quality + "%"
        : kind === "ethernet" ? iface + "  wired" : "Disconnected"
    onClicked: Quickshell.execDetached(["omarchy-launch-wifi"])

    Process {
        id: probe
        command: ["sh", Quickshell.shellDir + "/bar/network-status.sh"]
        stdout: StdioCollector {
            onStreamFinished: {
                const [kind, link, iface] = text.trim().split(/\s+/);
                root.kind = kind || "disconnected";
                // /proc/net/wireless link quality is out of 70 for nl80211 drivers.
                root.quality = Math.max(0, Math.min(100, Math.round(Number(link || 0) / 70 * 100)));
                root.iface = iface || "";
            }
        }
    }

    Timer {
        interval: 5000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: probe.running = true
    }
}
