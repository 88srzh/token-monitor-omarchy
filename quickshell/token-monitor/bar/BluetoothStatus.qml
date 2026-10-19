import QtQuick
import Quickshell
import Quickshell.Bluetooth
import qs.components
import qs.services

// Hidden without a controller, like Waybar's empty `format-no-controller`.
BarIcon {
    id: root

    readonly property var adapter: Bluetooth.defaultAdapter
    readonly property var connectedDevices: {
        const names = [];
        for (const device of Bluetooth.devices.values) {
            if (device.connected) names.push(device.name);
        }
        return names;
    }

    visible: adapter !== null
    leftMargin: 0
    rightMargin: 17
    text: adapter === null || !adapter.enabled
        ? Icons.bluetoothOff
        : connectedDevices.length ? Icons.bluetoothConnected : Icons.bluetooth
    tooltip: adapter === null ? ""
        : !adapter.enabled ? "Bluetooth off"
        : connectedDevices.length ? connectedDevices.join("\n") : "Bluetooth on"
    onClicked: Quickshell.execDetached(["omarchy-launch-bluetooth"])
}
