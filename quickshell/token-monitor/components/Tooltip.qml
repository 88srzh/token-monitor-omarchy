import QtQuick
import Quickshell
import qs.services

// A Waybar-style tooltip under a bar item, shown after a short hover.
PopupWindow {
    id: root

    required property Item target
    property string text: ""
    property bool hovered: false

    anchor.item: target
    anchor.edges: Edges.Bottom
    anchor.gravity: Edges.Bottom
    anchor.margins.top: 4
    visible: shown && text !== ""
    color: "transparent"
    implicitWidth: label.implicitWidth + 16
    implicitHeight: label.implicitHeight + 10

    property bool shown: false

    onHoveredChanged: {
        if (hovered) delay.restart();
        else {
            delay.stop();
            shown = false;
        }
    }

    Timer {
        id: delay
        interval: 450
        onTriggered: root.shown = true
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.background
        border.color: Theme.border
        border.width: 1

        Text {
            id: label
            anchors.centerIn: parent
            text: root.text
            color: Theme.foreground
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSize
        }
    }
}
