import QtQuick
import Quickshell
import Quickshell.Io

// The Hub feed: runs src/quickshell/bridge.js from the Token Monitor checkout
// and keeps its latest line. The bridge has already turned each stats snapshot
// into display rows, so nothing here interprets usage data.
//
// The checkout and the Node binary come from backend.json, which the
// checkout's scripts/omarchy/install.sh writes outside the plugin folder. The
// plugin is installed on its own (`omarchy plugin add`) rather than from the
// checkout: omarchy-shell watches its plugin directory recursively and reloads
// every plugin on any write, and the Hub writes into the checkout on every
// ingest.
Item {
  id: root

  property var model: null
  property bool connected: false
  property string error: ""
  property string hubUrl: ""

  property string repoRoot: ""
  property string node: "node"
  readonly property string configPath: (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config")
    + "/token-monitor-omarchy/backend.json"

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

  // Also rereads backend.json, so installing the backend after the plugin
  // needs no shell restart.
  function restart() {
    bridge.running = false
    config.reload()
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
        root.error = "backend.json is not valid JSON; re-run scripts/omarchy/install.sh"
        return
      }
      root.repoRoot = String(parsed.repoRoot || "")
      root.node = String(parsed.node || "node")
      if (root.repoRoot !== "") bridge.running = true
    }
    onLoadFailed: root.error = "backend not installed: see the plugin README"
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
