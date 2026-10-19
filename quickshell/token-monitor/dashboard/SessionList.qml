import QtQuick
import QtQuick.Layouts
import qs.components
import qs.services

// Recent sessions, newest first, with a live-state dot and context headroom.
ColumnLayout {
    id: root

    property var rows: []

    function stateColor(state) {
        if (state === "running") return Theme.success;
        if (state === "waiting") return Theme.warning;
        if (state === "ended") return Theme.muted;
        return Theme.faint;
    }

    spacing: 8

    Repeater {
        model: root.rows

        delegate: ColumnLayout {
            id: row

            required property var modelData

            spacing: 2
            Layout.fillWidth: true

            RowLayout {
                spacing: 6
                Layout.fillWidth: true

                Rectangle {
                    implicitWidth: 7
                    implicitHeight: 7
                    radius: 3.5
                    color: root.stateColor(row.modelData.state)
                }

                UiText {
                    text: row.modelData.title
                    Layout.fillWidth: true
                    Layout.minimumWidth: 40
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

            UiText {
                text: [row.modelData.clientLabel, row.modelData.project, row.modelData.lastUsedText, row.modelData.contextText]
                    .filter(part => part).join(" · ")
                color: Theme.faint
                small: true
                leftPadding: 13
                Layout.fillWidth: true
            }
        }
    }
}
