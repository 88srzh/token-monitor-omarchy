import QtQuick
import Quickshell
import Quickshell.Services.Pipewire
import qs.components
import qs.services

// Default sink volume: click opens Omarchy's mixer, right click mutes, scroll
// steps by 5%.
BarIcon {
    id: root

    readonly property var sink: Pipewire.defaultAudioSink
    readonly property bool ready: sink !== null && sink.audio !== null
    readonly property real volume: ready ? sink.audio.volume : 0
    readonly property bool muted: ready && sink.audio.muted

    text: muted || volume <= 0
        ? Icons.volumeMuted
        : Icons.volume[Math.min(Icons.volume.length - 1, Math.floor(volume * Icons.volume.length))]
    tooltip: ready ? (muted ? "Muted" : Math.round(volume * 100) + "%") : ""
    onClicked: Quickshell.execDetached(["omarchy-launch-audio"])
    onRightClicked: if (ready) sink.audio.muted = !sink.audio.muted
    onScrolled: delta => {
        if (!ready) return;
        sink.audio.volume = Math.max(0, Math.min(1, sink.audio.volume + (delta > 0 ? 0.05 : -0.05)));
    }

    PwObjectTracker {
        objects: root.sink ? [root.sink] : []
    }
}
