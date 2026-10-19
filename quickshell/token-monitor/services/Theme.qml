pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// Colours and font from the active Omarchy theme, the same sources Waybar
// reads: the theme's waybar.css (`@define-color foreground/background`) and
// the font family `omarchy-font-set` writes into ~/.config/waybar/style.css.
//
// Both files are re-read on a short poll rather than watched: a theme switch
// swaps what ~/.config/omarchy/current/theme points at, which an inotify watch
// on the old file never sees.
Singleton {
    id: root

    readonly property string home: Quickshell.env("HOME")
    readonly property string themeCss: home + "/.config/omarchy/current/theme/waybar.css"
    readonly property string waybarStyle: home + "/.config/waybar/style.css"

    property color foreground: "#cdd6f4"
    property color background: "#181824"
    property string fontFamily: "JetBrainsMono Nerd Font"

    readonly property color muted: mix(0.6)
    readonly property color faint: mix(0.35)
    readonly property color border: mix(0.16)
    readonly property color track: mix(0.12)
    readonly property color surface: Qt.tint(background, Qt.rgba(foreground.r, foreground.g, foreground.b, 0.05))
    readonly property color surfaceHover: Qt.tint(background, Qt.rgba(foreground.r, foreground.g, foreground.b, 0.1))
    // Waybar's recording indicator red, plus an amber and green of the same weight.
    readonly property color critical: "#a55555"
    readonly property color warning: "#c9a35a"
    readonly property color success: "#7fa66f"

    readonly property int barHeight: 26
    readonly property real fontSize: 12

    function mix(alpha) {
        return Qt.rgba(foreground.r, foreground.g, foreground.b, alpha);
    }

    function toneColor(tone) {
        if (tone === "crit") return critical;
        if (tone === "warn") return warning;
        return foreground;
    }

    // Accepts #rgb, #rrggbb, #rrggbbaa and rgb()/rgba(); Qt parses only the first two.
    function parseColor(value) {
        const text = String(value || "").trim();
        const fn = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
        if (fn) return Qt.rgba(fn[1] / 255, fn[2] / 255, fn[3] / 255, fn[4] === undefined ? 1 : Number(fn[4]));
        const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
        if (!hex) return null;
        let digits = hex[1];
        if (digits.length === 3) digits = digits.split("").map(c => c + c).join("");
        const channel = index => parseInt(digits.slice(index, index + 2), 16) / 255;
        return Qt.rgba(channel(0), channel(2), channel(4), digits.length === 8 ? channel(6) : 1);
    }

    function applyThemeCss(text) {
        const colors = {};
        const pattern = /@define-color\s+([\w-]+)\s+([^;]+);/g;
        let match;
        while ((match = pattern.exec(text)) !== null) colors[match[1]] = parseColor(match[2]);
        if (colors.foreground && !Qt.colorEqual(colors.foreground, foreground)) foreground = colors.foreground;
        if (colors.background && !Qt.colorEqual(colors.background, background)) background = colors.background;
    }

    function applyWaybarStyle(text) {
        const match = text.match(/font-family:\s*['"]?([^'",;]+)/);
        if (match && match[1].trim() !== fontFamily) fontFamily = match[1].trim();
    }

    FileView {
        id: themeFile
        path: root.themeCss
        printErrors: false
        onLoaded: root.applyThemeCss(text())
    }

    FileView {
        id: styleFile
        path: root.waybarStyle
        printErrors: false
        onLoaded: root.applyWaybarStyle(text())
    }

    Timer {
        interval: 3000
        running: true
        repeat: true
        onTriggered: {
            themeFile.reload();
            styleFile.reload();
        }
    }

    IpcHandler {
        target: "theme"

        function reload(): void {
            themeFile.reload();
            styleFile.reload();
        }
    }
}
