import QtQuick
import Quickshell.Io

// The Hub feed: runs src/quickshell/bridge.js from the Token Monitor checkout
// and keeps its latest line. The bridge has already turned each stats snapshot
// into display rows, so nothing here interprets usage data.
//
// The checkout and the Node binary come from local.json, which
// scripts/omarchy/install.sh writes next to this file. The plugin directory is
// a copy rather than the checkout itself: omarchy-shell watches its plugin
// directory recursively and reloads every plugin on any write, and the Hub
// writes into the checkout on every ingest.
Item {
  id: root

  property var model: null
  property bool connected: false
  property string error: ""
  property string hubUrl: ""

  property string repoRoot: ""
  property string node: "node"
  readonly property string configPath: decodeURIComponent(String(Qt.resolvedUrl("local.json")).replace(/^file:\/\//, ""))

  function handleLine(line) {
    var message
    try {
      message = JSON.parse(line)
    } catch (e) {
      return
    }
    if (message.hubUrl) hubUrl = message.hubUrl
    if (message.type === "model") {
      model = message.model
      connected = true
      error = ""
    } else if (message.type === "status") {
      connected = false
      error = message.error || "hub unreachable"
    }
  }

  function restart() {
    bridge.running = false
    restartTimer.restart()
  }

  FileView {
    id: config
    path: root.configPath
    printErrors: false
    onLoaded: {
      var parsed
      try {
        parsed = JSON.parse(text())
      } catch (e) {
        root.error = "local.json is not valid JSON; re-run scripts/omarchy/install.sh"
        return
      }
      root.repoRoot = String(parsed.repoRoot || "")
      root.node = String(parsed.node || "node")
      if (root.repoRoot !== "") bridge.running = true
    }
    onLoadFailed: root.error = "not installed: run scripts/omarchy/install.sh from the Token Monitor checkout"
  }

  Process {
    id: bridge
    command: [root.node, root.repoRoot + "/src/quickshell/bridge.js"]
    workingDirectory: root.repoRoot
    stdout: SplitParser {
      onRead: function(data) { root.handleLine(data) }
    }
    stderr: SplitParser {
      onRead: function(data) { console.warn("token-monitor bridge:", data) }
    }
    onExited: function(exitCode) {
      root.connected = false
      root.error = "bridge exited with code " + exitCode
      restartTimer.restart()
    }
  }

  Timer {
    id: restartTimer
    interval: 5000
    onTriggered: if (root.repoRoot !== "") bridge.running = true
  }
}
