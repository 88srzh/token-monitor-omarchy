import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland
import qs.components
import qs.services

// Omarchy's workspace strip: 1–5 always shown, any other workspace while it
// exists, the active one as a filled square and empty ones dimmed.
RowLayout {
    id: root

    required property ShellScreen screen
    readonly property HyprlandMonitor monitor: Hyprland.monitorFor(screen)

    spacing: 0

    readonly property var ids: {
        const ids = new Set([1, 2, 3, 4, 5]);
        for (const workspace of Hyprland.workspaces.values) {
            if (workspace.id > 0) ids.add(workspace.id);
        }
        return Array.from(ids).sort((a, b) => a - b);
    }

    function workspaceById(id) {
        for (const workspace of Hyprland.workspaces.values) {
            if (workspace.id === id) return workspace;
        }
        return null;
    }

    Repeater {
        model: root.ids

        delegate: BarIcon {
            required property int modelData
            readonly property var workspace: root.workspaceById(modelData)
            readonly property bool active: root.monitor !== null && root.monitor.activeWorkspace !== null
                && root.monitor.activeWorkspace.id === modelData
            readonly property bool occupied: workspace !== null && workspace.toplevels.values.length > 0

            text: active ? Icons.workspaceActive : (modelData === 10 ? "0" : String(modelData))
            // Waybar's `#workspaces button { padding: 0 6px; margin: 0 1.5px; min-width: 9px }`.
            leftMargin: 7.5
            rightMargin: 7.5
            minWidth: 9
            opacity: active || occupied ? 1 : 0.5
            color: workspace !== null && workspace.urgent ? Theme.critical : Theme.foreground
            onClicked: Hyprland.dispatch("workspace " + modelData)
            onScrolled: delta => Hyprland.dispatch(delta > 0 ? "workspace e-1" : "workspace e+1")
        }
    }
}
