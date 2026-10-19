import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import qs.services

// Omarchy's Waybar layout rebuilt: menu and workspaces on the left, clock and
// indicators in the centre, Token Monitor ahead of the stock right-hand modules.
PanelWindow {
    id: bar

    required property ShellScreen modelData

    screen: modelData
    anchors {
        top: true
        left: true
        right: true
    }
    implicitHeight: Theme.barHeight
    color: Theme.background
    WlrLayershell.namespace: "token-monitor-bar"
    WlrLayershell.layer: WlrLayer.Top

    RowLayout {
        anchors.left: parent.left
        anchors.leftMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        spacing: 0

        OmarchyButton {}
        Workspaces {
            screen: bar.screen
        }
    }

    RowLayout {
        anchors.centerIn: parent
        spacing: 0

        Clock {}
        UpdateIndicator {}
        RecordingIndicator {}
    }

    RowLayout {
        anchors.right: parent.right
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        spacing: 0

        TokenButton {
            screen: bar.screen
        }
        Tray {
            barWindow: bar
        }
        BluetoothStatus {}
        Network {}
        Audio {}
        Cpu {}
        Battery {}
    }
}
