import QtQuick
import QtQuick.Layouts
import qs.components
import qs.services

// A titled block of the dashboard. Children go in the column under the title;
// `trailing` is optional text on the title's right.
ColumnLayout {
    id: root

    property string title: ""
    property string trailing: ""
    property string emptyText: ""
    property bool empty: false
    default property alias content: body.data

    spacing: 8

    RowLayout {
        Layout.fillWidth: true

        UiText {
            text: root.title.toUpperCase()
            muted: true
            small: true
            font.letterSpacing: 1
            Layout.fillWidth: true
        }

        UiText {
            visible: root.trailing !== ""
            text: root.trailing
            muted: true
            small: true
        }
    }

    UiText {
        visible: root.empty
        text: root.emptyText
        color: Theme.faint
        Layout.fillWidth: true
    }

    ColumnLayout {
        id: body
        visible: !root.empty
        spacing: 6
        Layout.fillWidth: true
    }
}
