import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Services.SystemTray
import Quickshell.Widgets
import qs.components
import qs.services

// Omarchy's tray expander: the tray stays folded behind a chevron until clicked.
RowLayout {
    id: root

    required property var barWindow
    property bool expanded: false

    spacing: 0

    RowLayout {
        visible: root.expanded
        spacing: 12
        Layout.rightMargin: 16

        Repeater {
            model: SystemTray.items

            delegate: MouseArea {
                id: trayItem

                required property SystemTrayItem modelData

                implicitWidth: 12
                implicitHeight: Theme.barHeight
                acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor

                onClicked: event => {
                    const item = trayItem.modelData;
                    if (event.button === Qt.MiddleButton) {
                        item.secondaryActivate();
                    } else if (event.button === Qt.RightButton || item.onlyMenu) {
                        if (!item.hasMenu) return;
                        const point = trayItem.mapToItem(null, 0, trayItem.height);
                        item.display(root.barWindow, point.x, point.y);
                    } else {
                        item.activate();
                    }
                }
                onWheel: event => trayItem.modelData.scroll(event.angleDelta.y, false)

                IconImage {
                    anchors.centerIn: parent
                    implicitSize: 12
                    source: trayItem.modelData.icon
                }

                Tooltip {
                    target: trayItem
                    text: trayItem.modelData.tooltipTitle || trayItem.modelData.title || ""
                    hovered: trayItem.containsMouse
                }
            }
        }
    }

    BarIcon {
        text: root.expanded ? Icons.trayExpanded : Icons.trayCollapsed
        leftMargin: 0
        rightMargin: 18
        tooltip: root.expanded ? "" : "Show tray"
        onClicked: root.expanded = !root.expanded
    }
}
