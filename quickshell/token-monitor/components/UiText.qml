import QtQuick
import qs.services

// Text in the theme font. `muted` and `small` cover the dashboard's two
// secondary styles so sizes stay consistent.
Text {
    property bool muted: false
    property bool small: false
    property bool strong: false

    color: muted ? Theme.muted : Theme.foreground
    font.family: Theme.fontFamily
    font.pixelSize: small ? Theme.fontSize - 1 : Theme.fontSize
    font.bold: strong
    elide: Text.ElideRight
}
