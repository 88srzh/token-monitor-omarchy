import QtQuick
import QtQuick.Layouts
import qs.components
import qs.services

Rectangle {
    id: root

    property string label: ""
    property string value: ""
    property string detail: ""

    color: Theme.surface
    border.color: Theme.border
    border.width: 1
    implicitHeight: column.implicitHeight + 20
    Layout.fillWidth: true
    Layout.preferredWidth: 1

    ColumnLayout {
        id: column
        anchors.fill: parent
        anchors.margins: 10
        spacing: 2

        UiText {
            text: root.label
            muted: true
            small: true
            Layout.fillWidth: true
        }

        UiText {
            text: root.value
            font.pixelSize: Theme.fontSize + 8
            strong: true
            Layout.fillWidth: true
        }

        UiText {
            visible: root.detail !== ""
            text: root.detail
            color: Theme.faint
            small: true
            Layout.fillWidth: true
        }
    }
}
