import QtQuick
import QtQuick.Layouts
import qs.components
import qs.services

// Daily tokens for the last 30 days. Hovering a bar names the day in the
// caption, which otherwise shows the window's total.
ColumnLayout {
    id: root

    property var history: null
    property int hovered: -1

    readonly property var days: history ? history.days : []
    readonly property var hoveredDay: hovered >= 0 && hovered < days.length ? days[hovered] : null

    spacing: 6

    Item {
        implicitHeight: 72
        Layout.fillWidth: true

        Row {
            id: bars
            anchors.fill: parent
            spacing: 2

            Repeater {
                model: root.days

                delegate: Item {
                    id: slot

                    required property var modelData
                    required property int index

                    width: (bars.width - bars.spacing * (root.days.length - 1)) / Math.max(1, root.days.length)
                    height: bars.height

                    Rectangle {
                        anchors.bottom: parent.bottom
                        width: parent.width
                        // A 1px stub keeps idle days visible as slots.
                        height: Math.max(1, parent.height * slot.modelData.fraction)
                        color: root.hovered === slot.index ? Theme.foreground
                            : slot.index === root.days.length - 1 ? Theme.mix(0.8) : Theme.mix(0.45)
                    }

                    MouseArea {
                        anchors.fill: parent
                        hoverEnabled: true
                        onContainsMouseChanged: {
                            if (containsMouse) root.hovered = slot.index;
                            else if (root.hovered === slot.index) root.hovered = -1;
                        }
                    }
                }
            }
        }
    }

    RowLayout {
        Layout.fillWidth: true

        UiText {
            text: root.hoveredDay
                ? root.hoveredDay.label + "  " + root.hoveredDay.tokensText + " tokens · " + root.hoveredDay.costText
                : root.history ? root.history.windowTokensText + " tokens in 30 days" : ""
            Layout.fillWidth: true
        }

        UiText {
            text: root.history
                ? root.history.activeDays + " active days · streak " + root.history.currentStreak
                    + " (best " + root.history.longestStreak + ") · peak " + root.history.peakDayText
                : ""
            muted: true
            small: true
        }
    }
}
