import QtQuick
import QtQuick.Layouts
import qs.components
import qs.services

// Ranked rows with a share bar: tools, models and projects. Each row is
// `{ id, label, color, tokensText, costText, fraction }` from the bridge, plus
// an optional `clientLabel` shown dimmed after the name.
ColumnLayout {
    id: root

    property var rows: []

    spacing: 8

    Repeater {
        model: root.rows

        delegate: ColumnLayout {
            id: row

            required property var modelData

            spacing: 3
            Layout.fillWidth: true

            RowLayout {
                spacing: 6
                Layout.fillWidth: true

                Rectangle {
                    implicitWidth: 7
                    implicitHeight: 7
                    color: row.modelData.color || Theme.muted
                }

                UiText {
                    text: row.modelData.label
                    Layout.fillWidth: true
                    Layout.minimumWidth: 40
                }

                UiText {
                    visible: !!row.modelData.clientLabel
                    text: row.modelData.clientLabel || ""
                    color: Theme.faint
                    small: true
                    Layout.maximumWidth: 110
                }

                UiText {
                    text: row.modelData.tokensText
                    strong: true
                }

                UiText {
                    text: row.modelData.costText
                    muted: true
                    horizontalAlignment: Text.AlignRight
                    Layout.preferredWidth: 64
                }
            }

            Meter {
                fraction: row.modelData.fraction
                fillColor: row.modelData.color || Theme.muted
                Layout.fillWidth: true
            }
        }
    }
}
