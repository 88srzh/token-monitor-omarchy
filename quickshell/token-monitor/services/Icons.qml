pragma Singleton

import QtQuick
import Quickshell

// Nerd Font glyphs, matching the ones Omarchy's Waybar config uses, by code
// point so a reviewer can look each one up.
Singleton {
    function glyph(codePoint) {
        return String.fromCodePoint(codePoint);
    }

    function glyphs(codePoints) {
        return codePoints.map(glyph);
    }

    // Omarchy's own logo font, installed with Omarchy.
    readonly property string omarchyFont: "omarchy"
    readonly property string omarchy: ""

    readonly property string tokens: glyph(0xF06A9)
    readonly property string workspaceActive: glyph(0xF14FB)
    readonly property string trayCollapsed: glyph(0xF0141)
    readonly property string trayExpanded: glyph(0xF0142)
    readonly property string update: glyph(0xF06B0)
    readonly property string recording: glyph(0xF044A)
    readonly property string cpu: glyph(0xF035B)

    readonly property var wifi: glyphs([0xF092F, 0xF091F, 0xF0922, 0xF0925, 0xF0928])
    readonly property string ethernet: glyph(0xF0002)
    readonly property string networkOff: glyph(0xF092E)

    readonly property string bluetooth: glyph(0xF293)
    readonly property string bluetoothOff: glyph(0xF00B2)
    readonly property string bluetoothConnected: glyph(0xF00B1)

    readonly property var volume: glyphs([0xF026, 0xF027, 0xF028])
    readonly property string volumeMuted: glyph(0xF075F)

    readonly property var battery: glyphs([0xF007A, 0xF007B, 0xF007C, 0xF007D, 0xF007E, 0xF007F, 0xF0080, 0xF0081, 0xF0082, 0xF0079])
    readonly property var batteryCharging: glyphs([0xF089C, 0xF0086, 0xF0087, 0xF0088, 0xF089D, 0xF0089, 0xF089E, 0xF008A, 0xF008B, 0xF0085])
    readonly property string batteryFull: glyph(0xF0085)
    readonly property string plugged: glyph(0xF1E6)

    readonly property string close: glyph(0xF0156)
}
