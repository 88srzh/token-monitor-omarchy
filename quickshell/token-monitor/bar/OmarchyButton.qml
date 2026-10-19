import QtQuick
import Quickshell
import qs.components
import qs.services

BarIcon {
    text: Icons.omarchy
    fontFamily: Icons.omarchyFont
    tooltip: "Omarchy Menu\n\nSuper + Alt + Space"
    onClicked: Quickshell.execDetached(["omarchy-menu"])
    onRightClicked: Quickshell.execDetached(["xdg-terminal-exec"])
}
