import QtQuick
import qs.services

// One Waybar-style module: a glyph with Waybar's margins, click handlers and
// an optional tooltip. Every bar item is one of these so they line up.
Item {
    id: root

    property string text: ""
    property color color: Theme.foreground
    property string fontFamily: Theme.fontFamily
    property real pixelSize: Theme.fontSize
    property string tooltip: ""
    // Waybar's `margin: 0 7.5px; min-width: 12px` for icon modules.
    property real leftMargin: 7.5
    property real rightMargin: 7.5
    property real minWidth: 12
    readonly property bool hovered: mouse.containsMouse

    signal clicked()
    signal rightClicked()
    signal middleClicked()
    signal scrolled(int delta)

    implicitWidth: Math.max(minWidth, label.implicitWidth) + leftMargin + rightMargin
    implicitHeight: Theme.barHeight

    Text {
        id: label
        x: root.leftMargin + (Math.max(root.minWidth, implicitWidth) - implicitWidth) / 2
        anchors.verticalCenter: parent.verticalCenter
        text: root.text
        color: root.color
        font.family: root.fontFamily
        font.pixelSize: root.pixelSize
    }

    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
        cursorShape: Qt.PointingHandCursor
        onClicked: event => {
            if (event.button === Qt.RightButton) root.rightClicked();
            else if (event.button === Qt.MiddleButton) root.middleClicked();
            else root.clicked();
        }
        onWheel: event => root.scrolled(event.angleDelta.y)
    }

    Tooltip {
        target: root
        text: root.tooltip
        hovered: mouse.containsMouse
    }
}
