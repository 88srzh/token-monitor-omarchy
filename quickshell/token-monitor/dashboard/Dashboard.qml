import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import qs.components
import qs.services

// The usage dashboard, dropped from the right end of the bar. Esc or a click
// elsewhere closes it; 1/2/3 switch between Today, Month and All time.
PanelWindow {
    id: root

    readonly property var model: TokenMonitor.model
    readonly property var period: TokenMonitor.current
    readonly property int gap: 12
    readonly property var periods: [
        { key: "today", label: "Today" },
        { key: "month", label: "Month" },
        { key: "allTime", label: "All time" }
    ]

    screen: TokenMonitor.dashboardScreen
    anchors {
        top: true
        right: true
    }
    margins {
        top: 6
        right: 8
    }
    exclusiveZone: 0
    implicitWidth: 780
    implicitHeight: Math.min(content.implicitHeight + 2 * 18, (screen ? screen.height : 900) - Theme.barHeight - 24)
    color: "transparent"
    WlrLayershell.namespace: "token-monitor-dashboard"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand

    HyprlandFocusGrab {
        active: root.visible
        windows: [root]
        onCleared: TokenMonitor.closeDashboard()
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.background
        border.color: Theme.border
        border.width: 2

        Flickable {
            id: flick
            anchors.fill: parent
            anchors.margins: 18
            contentHeight: content.implicitHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds

            Item {
                id: keys
                focus: true
                Keys.onEscapePressed: TokenMonitor.closeDashboard()
                Keys.onPressed: event => {
                    const index = event.key - Qt.Key_1;
                    if (index >= 0 && index < root.periods.length) {
                        TokenMonitor.period = root.periods[index].key;
                        event.accepted = true;
                    }
                }
            }

            ColumnLayout {
                id: content
                width: flick.width
                spacing: 18

                // Header: title, connection state and period tabs.
                RowLayout {
                    spacing: 10
                    Layout.fillWidth: true

                    UiText {
                        text: Icons.tokens
                        font.pixelSize: Theme.fontSize + 6
                    }

                    ColumnLayout {
                        spacing: 0
                        Layout.fillWidth: true

                        UiText {
                            text: "Token Monitor"
                            strong: true
                            font.pixelSize: Theme.fontSize + 2
                        }

                        UiText {
                            text: TokenMonitor.connected
                                ? "Live · " + TokenMonitor.hubUrl + (root.model && root.model.updatedText ? " · updated " + root.model.updatedText : "")
                                : "Offline · " + (TokenMonitor.error || "connecting…")
                            color: TokenMonitor.connected ? Theme.muted : Theme.critical
                            small: true
                            Layout.fillWidth: true
                        }
                    }

                    Repeater {
                        model: root.periods

                        delegate: Rectangle {
                            id: tab

                            required property var modelData
                            required property int index
                            readonly property bool selected: TokenMonitor.period === modelData.key

                            implicitWidth: tabLabel.implicitWidth + 20
                            implicitHeight: tabLabel.implicitHeight + 10
                            color: selected ? Theme.foreground : tabMouse.containsMouse ? Theme.surfaceHover : "transparent"
                            border.color: Theme.border
                            border.width: selected ? 0 : 1

                            UiText {
                                id: tabLabel
                                anchors.centerIn: parent
                                text: tab.modelData.label
                                color: tab.selected ? Theme.background : Theme.foreground
                            }

                            MouseArea {
                                id: tabMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: TokenMonitor.period = tab.modelData.key
                            }
                        }
                    }

                    UiText {
                        text: Icons.close
                        muted: !closeMouse.containsMouse
                        font.pixelSize: Theme.fontSize + 4
                        Layout.leftMargin: 6

                        MouseArea {
                            id: closeMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: TokenMonitor.closeDashboard()
                        }
                    }
                }

                UiText {
                    visible: root.model === null
                    text: TokenMonitor.connected ? "Waiting for the first snapshot…"
                        : "No data from the Hub. Check the services:\n  systemctl --user status token-monitor-hub token-monitor-agent"
                    muted: true
                    wrapMode: Text.Wrap
                    elide: Text.ElideNone
                    Layout.fillWidth: true
                }

                // Headline figures for the selected period.
                RowLayout {
                    visible: root.period !== null
                    spacing: root.gap
                    Layout.fillWidth: true

                    StatCard {
                        label: "Tokens"
                        value: root.period ? root.period.tokensText : ""
                        detail: root.period ? root.period.tokensExact : ""
                    }
                    StatCard {
                        label: "Cost"
                        value: root.period ? root.period.costText : ""
                    }
                    StatCard {
                        label: "Output"
                        value: root.period ? root.period.outputText : ""
                    }
                    StatCard {
                        label: "Cache read"
                        value: root.period ? root.period.cacheShareText : ""
                    }
                    StatCard {
                        label: "Speed"
                        value: root.period ? root.period.throughputText : ""
                    }
                }

                Section {
                    visible: root.model !== null
                    title: "AI tool limits"
                    empty: root.model !== null && root.model.limits.length === 0
                    emptyText: "No limits providers are reporting. Enable them in the agent's .env."
                    Layout.fillWidth: true

                    GridLayout {
                        columns: 3
                        columnSpacing: root.gap
                        rowSpacing: root.gap
                        Layout.fillWidth: true

                        Repeater {
                            model: root.model ? root.model.limits : []

                            delegate: LimitCard {
                                required property var modelData

                                provider: modelData
                                Layout.fillWidth: true
                                Layout.preferredWidth: 1
                                Layout.alignment: Qt.AlignTop
                            }
                        }
                    }
                }

                RowLayout {
                    visible: root.period !== null
                    spacing: 2 * root.gap
                    Layout.fillWidth: true

                    Section {
                        title: "Tools"
                        empty: root.period !== null && root.period.clients.length === 0
                        emptyText: "No tool usage in this period."
                        Layout.fillWidth: true
                        Layout.preferredWidth: 1
                        Layout.alignment: Qt.AlignTop

                        BreakdownList {
                            rows: root.period ? root.period.clients : []
                            Layout.fillWidth: true
                        }
                    }

                    Section {
                        title: "Models"
                        empty: root.period !== null && root.period.models.length === 0
                        emptyText: "No model usage in this period."
                        Layout.fillWidth: true
                        Layout.preferredWidth: 1
                        Layout.alignment: Qt.AlignTop

                        BreakdownList {
                            rows: root.period ? root.period.models : []
                            Layout.fillWidth: true
                        }
                    }
                }

                Section {
                    visible: root.model !== null
                    title: "Last 30 days"
                    trailing: root.model && root.model.history.favoriteModel ? "favourite: " + root.model.history.favoriteModel : ""
                    Layout.fillWidth: true

                    HistoryChart {
                        history: root.model ? root.model.history : null
                        Layout.fillWidth: true
                    }
                }

                RowLayout {
                    visible: root.model !== null
                    spacing: 2 * root.gap
                    Layout.fillWidth: true

                    Section {
                        title: "Recent sessions"
                        empty: root.model !== null && root.model.sessions.length === 0
                        emptyText: "No sessions this month."
                        Layout.fillWidth: true
                        Layout.preferredWidth: 1
                        Layout.alignment: Qt.AlignTop

                        SessionList {
                            rows: root.model ? root.model.sessions : []
                            Layout.fillWidth: true
                        }
                    }

                    Section {
                        title: "Projects"
                        empty: root.period !== null && root.period.projects.length === 0
                        emptyText: "No project usage in this period."
                        Layout.fillWidth: true
                        Layout.preferredWidth: 1
                        Layout.alignment: Qt.AlignTop

                        BreakdownList {
                            rows: root.period ? root.period.projects : []
                            Layout.fillWidth: true
                        }
                    }
                }

                Section {
                    visible: root.model !== null && root.model.devices.length > 0
                    title: "Devices"
                    Layout.fillWidth: true

                    Flow {
                        spacing: root.gap
                        Layout.fillWidth: true

                        Repeater {
                            model: root.model ? root.model.devices : []

                            delegate: Rectangle {
                                id: device

                                required property var modelData

                                implicitWidth: deviceColumn.implicitWidth + 20
                                implicitHeight: deviceColumn.implicitHeight + 14
                                color: Theme.surface
                                border.color: Theme.border
                                border.width: 1
                                opacity: modelData.stale ? 0.55 : 1

                                ColumnLayout {
                                    id: deviceColumn
                                    anchors.centerIn: parent
                                    spacing: 1

                                    UiText {
                                        text: device.modelData.name + "  " + device.modelData.todayText + " today"
                                        strong: true
                                    }

                                    UiText {
                                        text: [device.modelData.os, device.modelData.stale ? "stale" : "", "seen " + device.modelData.seenText]
                                            .filter(part => part).join(" · ")
                                        color: Theme.faint
                                        small: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
