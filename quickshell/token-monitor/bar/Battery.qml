import QtQuick
import Quickshell
import Quickshell.Services.UPower
import qs.components
import qs.services

// UPower's display device, with Waybar's icon ladders and its 10% critical
// state. Hidden on machines without a laptop battery.
BarIcon {
    id: root

    readonly property var device: UPower.displayDevice
    readonly property bool present: device !== null && device.isLaptopBattery
    // Quickshell reports 0–1; older builds reported 0–100.
    readonly property real percent: present ? (device.percentage <= 1 ? device.percentage * 100 : device.percentage) : 0
    readonly property bool charging: present && device.state === UPowerDeviceState.Charging
    readonly property bool full: present && device.state === UPowerDeviceState.FullyCharged
    readonly property bool plugged: present && !UPower.onBattery && !charging && !full

    function step(ladder) {
        return ladder[Math.max(0, Math.min(ladder.length - 1, Math.ceil(percent / 10) - 1))];
    }

    function duration(seconds) {
        const minutes = Math.round(seconds / 60);
        return Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
    }

    visible: present
    text: full ? Icons.batteryFull
        : plugged ? Icons.plugged
        : charging ? step(Icons.batteryCharging) : step(Icons.battery)
    color: !charging && !plugged && percent <= 10 ? Theme.critical : Theme.foreground
    tooltip: {
        if (!present) return "";
        let line = Math.round(percent) + "%";
        if (charging && device.timeToFull > 0) line += " · full in " + duration(device.timeToFull);
        else if (!charging && UPower.onBattery && device.timeToEmpty > 0) line += " · " + duration(device.timeToEmpty) + " left";
        return line;
    }
    onClicked: Quickshell.execDetached(["omarchy-menu", "power"])
}
