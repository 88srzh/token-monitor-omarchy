import QtQuick
import qs.services

// A flat horizontal bar: `fraction` of the track filled in `fillColor`.
Rectangle {
    id: root

    property real fraction: 0
    property color fillColor: Theme.foreground

    implicitHeight: 4
    color: Theme.track

    Rectangle {
        width: parent.width * Math.max(0, Math.min(1, root.fraction))
        height: parent.height
        color: root.fillColor

        Behavior on width {
            NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
        }
    }
}
