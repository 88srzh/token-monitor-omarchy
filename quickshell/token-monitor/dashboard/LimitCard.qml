import QtQuick
import QtQuick.Layouts
import qs.components
import qs.services

// One limits account: its windows as meters, or why it has none.
Rectangle {
    id: root

    required property var provider

    color: Theme.surface
    border.color: Theme.border
    border.width: 1
    implicitHeight: column.implicitHeight + 20
    opacity: provider.stale ? 0.6 : 1

    ColumnLayout {
        id: column
        anchors.fill: parent
        anchors.margins: 10
        spacing: 8

        RowLayout {
            spacing: 6
            Layout.fillWidth: true

            Rectangle {
                implicitWidth: 7
                implicitHeight: 7
                color: root.provider.color || Theme.foreground
            }

            UiText {
                text: root.provider.label
                strong: true
            }

            UiText {
                text: [root.provider.plan, root.provider.account].filter(part => part).join(" · ")
                muted: true
                small: true
                Layout.fillWidth: true
            }

            UiText {
                visible: root.provider.stale
                text: "stale"
                color: Theme.warning
                small: true
            }
        }

        UiText {
            visible: root.provider.statusText !== ""
            text: root.provider.statusText
            color: Theme.critical
            Layout.fillWidth: true
        }

        Repeater {
            model: root.provider.windows

            delegate: ColumnLayout {
                id: window

                required property var modelData

                spacing: 3
                Layout.fillWidth: true

                RowLayout {
                    Layout.fillWidth: true

                    UiText {
                        text: window.modelData.label
                        muted: true
                        Layout.fillWidth: true
                    }

                    UiText {
                        text: window.modelData.valueText
                        color: Theme.toneColor(window.modelData.tone)
                        strong: true
                    }
                }

                Meter {
                    visible: window.modelData.showMeter
                    fraction: window.modelData.fraction
                    fillColor: Theme.toneColor(window.modelData.tone)
                    Layout.fillWidth: true
                }

                UiText {
                    visible: text !== ""
                    text: [window.modelData.detailText, window.modelData.resetText].filter(part => part).join(" · ")
                    color: Theme.faint
                    small: true
                    Layout.fillWidth: true
                }
            }
        }

        UiText {
            visible: root.provider.updatedText !== ""
            text: "updated " + root.provider.updatedText
            color: Theme.faint
            small: true
            Layout.fillWidth: true
        }
    }
}
