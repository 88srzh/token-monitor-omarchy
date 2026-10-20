import QtQuick
import QtQuick.Controls
import QtQuick.Shapes
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Token Monitor's bar icon and dashboard panel, built like Omarchy's own
// agents panel. Every figure, label and countdown arrives preformatted from
// the bridge (src/quickshell/dashboardModel.js); this file only lays them out.
Panel {
  id: root
  moduleName: "token-monitor"
  ipcTarget: "token-monitor"
  manageIpc: false

  readonly property color foreground: bar ? bar.foreground : Commons.Color.foreground
  readonly property color urgent: bar ? bar.urgent : Commons.Color.urgent
  readonly property color accent: Commons.Color.accent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property color track: Style.selectedFillFor(foreground, Commons.Color.accent)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property string glyph: String.fromCodePoint(0xF0199)

  readonly property var periods: [
    { key: "today", label: "Today" },
    { key: "month", label: "Month" },
    { key: "allTime", label: "All time" }
  ]
  property string periodKey: "today"
  readonly property int periodIndex: {
    for (var i = 0; i < periods.length; i++)
      if (periods[i].key === periodKey) return i
    return 0
  }

  readonly property var model: feed.model
  readonly property var period: model ? model.periods[periodKey] : null
  readonly property var barState: model ? model.bar : null
  property bool cursorActive: false

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
  function alpha(c, a) { return Qt.rgba(c.r, c.g, c.b, a) }
  function joined(parts) { return parts.filter(function(part) { return !!part }).join(" · ") }

  // Omarchy has one alarm colour; the step before it borrows the accent.
  function toneColor(tone) {
    if (tone === "crit") return root.urgent
    if (tone === "warn") return root.accent
    return root.foreground
  }

  function selectPeriod(index) {
    var wrapped = ((index % periods.length) + periods.length) % periods.length
    periodKey = periods[wrapped].key
  }

  function heroMeta() {
    if (!feed.connected) return feed.error !== "" ? feed.error : "Connecting…"
    return model && model.updatedText !== "" ? "Updated " + model.updatedText : "Live"
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onOpenedChanged: if (opened) {
    cursorActive = false
    periodKey = root.setting("period", "today")
    if (panelFlick) panelFlick.contentY = 0
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  Feed {
    id: feed
  }

  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): string { feed.restart(); return "ok" }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.glyph
    active: !!root.barState && root.barState.tone === "crit"
    dimmed: !feed.connected
    tooltipText: feed.connected && root.barState
      ? root.barState.tooltip
      : "Token Monitor\n" + (feed.error !== "" ? feed.error : "Connecting…")
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.RightButton) feed.restart()
      else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(460))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(720))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent

      onMoveRequested: function(dx, dy) {
        if (dx !== 0) {
          root.cursorActive = true
          root.selectPeriod(root.periodIndex + dx)
        }
        if (dy !== 0)
          panelFlick.contentY = root.clamp(panelFlick.contentY + dy * Style.space(56), 0,
                                           Math.max(0, panelFlick.contentHeight - panelFlick.height))
      }
      onActivateRequested: feed.restart()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) {
        if (t === "r" || t === "R") feed.restart()
        else if (t === "1" || t === "2" || t === "3") root.selectPeriod(Number(t) - 1)
      }

      Flickable {
        id: panelFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { id: panelScroll; policy: ScrollBar.AsNeeded }

        Column {
          id: column
          // The scroll bar overlays the content, so leave it a gutter or it
          // covers the right-aligned figures.
          width: panelFlick.width - (panelFlick.interactive ? panelScroll.width + Style.spacing.sm : 0)
          spacing: Style.space(12)

          // ---------- Hero ----------
          PanelHero {
            width: parent.width
            title: "Token Monitor"
            meta: root.heroMeta()
            detail: feed.hubUrl
            foreground: root.foreground
            fontFamily: root.fontFamily

            iconComponent: Component {
              Text {
                textFormat: Text.PlainText
                text: root.glyph
                color: !!root.barState && root.barState.tone === "crit" ? root.urgent : root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.display
              }
            }
          }

          // ---------- Not connected ----------
          BorderSurface {
            visible: !feed.connected
            width: parent.width
            implicitHeight: offlineText.implicitHeight + Style.spacing.xl * 2
            color: root.alpha(root.urgent, 0.10)
            borderSpec: Border.flat(root.alpha(root.urgent, 0.35), 1)
            radius: Style.cornerRadius

            Text {
              id: offlineText
              textFormat: Text.PlainText
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.leftMargin: Style.space(12)
              anchors.rightMargin: Style.space(12)
              text: "No data from the Token Monitor hub. Check the services:\nsystemctl --user status token-monitor-hub token-monitor-agent"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              wrapMode: Text.WordWrap
            }
          }

          // ---------- Period switch ----------
          Row {
            id: periodSwitch
            visible: !!root.model
            width: parent.width
            spacing: Style.spacing.md

            readonly property real cellWidth: (width - spacing * (root.periods.length - 1)) / root.periods.length

            Repeater {
              model: root.periods

              Button {
                required property var modelData
                required property int index

                width: periodSwitch.cellWidth
                text: modelData.label
                selected: index === root.periodIndex
                hasCursor: root.cursorActive && index === root.periodIndex
                bordered: true
                foreground: root.foreground
                fontFamily: root.fontFamily
                fontSize: Style.font.bodySmall
                verticalPadding: Style.spacing.controlPaddingY
                onClicked: {
                  root.cursorActive = true
                  root.selectPeriod(index)
                }
                onHovered: function(isHovered) { if (isHovered) root.cursorActive = true }
              }
            }
          }

          // ---------- Headline figures ----------
          Column {
            visible: !!root.period
            width: parent.width
            spacing: Style.spacing.xs

            PanelSectionHeader {
              text: "TOTAL TOKENS"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              text: root.period ? root.period.tokensExact : ""
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Math.round(Style.font.displayLarge * 1.6)
              elide: Text.ElideRight
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              text: root.period ? root.period.costText : ""
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }
          }

          Grid {
            id: stats
            visible: !!root.period
            width: parent.width
            columns: 3
            columnSpacing: Style.spacing.lg
            rowSpacing: Style.spacing.lg

            readonly property real cellWidth: (width - columnSpacing * (columns - 1)) / columns

            StatCell { width: stats.cellWidth; label: "Speed"; value: root.period ? root.period.throughputText : "" }
            StatCell { width: stats.cellWidth; label: "Output"; value: root.period ? root.period.outputText : "" }
            StatCell { width: stats.cellWidth; label: "Cache read"; value: root.period ? root.period.cacheShareText : ""; hint: "Share of tokens read from the prompt cache" }
          }

          // ---------- Limits ----------
          PanelSeparator {
            visible: limitsSection.visible
            foreground: root.foreground
          }

          Column {
            id: limitsSection
            visible: !!root.model && root.model.limits.length > 0
            width: parent.width
            spacing: Style.space(14)

            PanelSectionHeader {
              text: "LIMITS"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            Repeater {
              model: root.model ? root.model.limits : []

              ProviderBlock {
                required property var modelData
                width: limitsSection.width
                provider: modelData
              }
            }
          }

          // ---------- Tools and models ----------
          PanelSeparator {
            visible: toolsSection.visible || modelsSection.visible
            foreground: root.foreground
          }

          ShareSection {
            id: toolsSection
            title: "TOOLS"
            rows: root.period ? root.period.clients : []
          }

          ShareSection {
            id: modelsSection
            title: "MODELS"
            rows: root.period ? root.period.models : []
          }

          // ---------- Activity and trend ----------
          PanelSeparator {
            visible: activitySection.visible
            foreground: root.foreground
          }

          Column {
            id: activitySection
            visible: !!root.model && !!root.model.activity
            width: parent.width
            spacing: Style.spacing.md

            readonly property var activity: root.model ? root.model.activity : null
            readonly property var trend: root.model ? root.model.trend : null
            readonly property var history: root.model ? root.model.history : null

            SectionHead {
              width: parent.width
              title: "ACTIVITY"
              meta: activitySection.activity ? activitySection.activity.activeDaysText : ""
            }

            Heatmap {
              width: parent.width
              activity: activitySection.activity
            }

            SectionHead {
              width: parent.width
              title: "TREND"
              meta: activitySection.trend ? activitySection.trend.peakText : ""
            }

            TrendChart {
              visible: steps.length > 0
              width: parent.width
              height: Style.space(64)
              steps: activitySection.trend ? activitySection.trend.path : []
            }

            Item {
              visible: !!activitySection.trend && activitySection.trend.path.length > 0
              width: parent.width
              implicitHeight: Style.font.caption + Style.spacing.xs

              Repeater {
                model: activitySection.trend ? activitySection.trend.dates : []

                Text {
                  required property var modelData
                  required property int index
                  textFormat: Text.PlainText
                  x: index === 0 ? 0 : index === 1 ? (parent.width - width) / 2 : parent.width - width
                  text: modelData
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
              }
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              text: activitySection.history
                ? root.joined([
                    "Last 30 days " + activitySection.history.windowTokensText,
                    "streak " + activitySection.history.currentStreak + " (best " + activitySection.history.longestStreak + ")",
                    activitySection.history.favoriteModel
                  ])
                : ""
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }
          }

          // ---------- Sessions ----------
          PanelSeparator {
            visible: sessionsSection.visible
            foreground: root.foreground
          }

          Column {
            id: sessionsSection
            visible: !!root.model && root.model.sessions.length > 0
            width: parent.width
            spacing: Style.spacing.lg

            PanelSectionHeader {
              width: parent.width
              text: "RECENT SESSIONS"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            Repeater {
              model: root.model ? root.model.sessions : []

              SessionRow {
                required property var modelData
                width: sessionsSection.width
                session: modelData
              }
            }
          }

          // ---------- Projects ----------
          PanelSeparator {
            visible: projectsSection.visible
            foreground: root.foreground
          }

          ShareSection {
            id: projectsSection
            title: "PROJECTS"
            rows: root.period ? root.period.projects : []
          }

          // ---------- Devices ----------
          PanelSeparator {
            visible: devicesSection.visible
            foreground: root.foreground
          }

          Column {
            id: devicesSection
            // One device is this machine; the list starts to say something at two.
            visible: !!root.model && root.model.devices.length > 1
            width: parent.width
            spacing: Style.spacing.md

            PanelSectionHeader {
              width: parent.width
              text: "DEVICES"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            Repeater {
              model: root.model ? root.model.devices : []

              Item {
                id: deviceRow
                required property var modelData

                width: devicesSection.width
                implicitHeight: Math.max(deviceName.implicitHeight, deviceToday.implicitHeight)
                opacity: modelData.stale ? 0.55 : 1

                Text {
                  id: deviceName
                  textFormat: Text.PlainText
                  anchors.left: parent.left
                  anchors.right: deviceToday.left
                  anchors.rightMargin: Style.spacing.sm
                  text: deviceRow.modelData.name + "  " + root.joined([deviceRow.modelData.os, deviceRow.modelData.stale ? "stale" : "", "seen " + deviceRow.modelData.seenText])
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  elide: Text.ElideRight
                }

                Text {
                  id: deviceToday
                  textFormat: Text.PlainText
                  anchors.right: parent.right
                  text: deviceRow.modelData.todayText + " today"
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  font.bold: true
                }
              }
            }
          }
        }
      }
    }
  }

  // A headline figure: caption label over a large value.
  component StatCell: Item {
    id: cell
    property string label: ""
    property string value: ""
    property string hint: ""

    implicitHeight: cellColumn.implicitHeight + Style.spacing.lg * 2

    Rectangle {
      anchors.fill: parent
      radius: Style.cornerRadius
      color: root.alpha(root.foreground, 0.05)
    }

    Column {
      id: cellColumn
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: Style.space(10)
      anchors.rightMargin: Style.space(10)
      spacing: Style.spacing.xs

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: cell.label
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }

      Text {
        textFormat: Text.PlainText
        width: parent.width
        text: cell.value
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.heading
        font.bold: true
        elide: Text.ElideRight
      }
    }

    MouseArea {
      id: cellHover
      anchors.fill: parent
      hoverEnabled: true
      acceptedButtons: Qt.NoButton
    }

    PanelToolTip {
      visible: cellHover.containsMouse && cell.hint !== ""
      text: cell.hint
      fontFamily: root.fontFamily
    }
  }

  // One limits account: name and plan, then each window as label, value,
  // meter and reset countdown — or the reason it has none.
  component ProviderBlock: Column {
    id: block
    property var provider: null

    spacing: Style.space(8)
    opacity: provider && provider.stale ? 0.6 : 1

    Item {
      width: parent.width
      implicitHeight: providerName.implicitHeight

      Rectangle {
        id: providerDot
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(7)
        height: width
        radius: width / 2
        color: block.provider && block.provider.color ? block.provider.color : root.foreground
      }

      Text {
        id: providerName
        textFormat: Text.PlainText
        anchors.left: providerDot.right
        anchors.leftMargin: Style.spacing.md
        text: block.provider ? block.provider.label : ""
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        font.bold: true
      }

      Text {
        textFormat: Text.PlainText
        anchors.left: providerName.right
        anchors.leftMargin: Style.spacing.md
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        text: block.provider
          ? root.joined([block.provider.plan, block.provider.account, block.provider.stale ? "stale" : ""])
          : ""
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        horizontalAlignment: Text.AlignRight
        elide: Text.ElideRight
      }
    }

    Text {
      textFormat: Text.PlainText
      visible: !!block.provider && block.provider.statusText !== ""
      width: parent.width
      text: block.provider ? block.provider.statusText : ""
      color: root.urgent
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }

    Repeater {
      model: block.provider ? block.provider.windows : []

      LimitRow {
        required property var modelData
        width: block.width
        window: modelData
      }
    }
  }

  component LimitRow: Column {
    id: limitRow
    property var window: null

    spacing: Style.space(6)

    Item {
      width: parent.width
      implicitHeight: Math.max(limitLabel.implicitHeight, limitValue.implicitHeight)

      Text {
        id: limitLabel
        textFormat: Text.PlainText
        text: limitRow.window ? limitRow.window.label : ""
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
        anchors.left: parent.left
        anchors.right: limitValue.left
        anchors.rightMargin: Style.spacing.sm
        anchors.verticalCenter: parent.verticalCenter
      }

      Text {
        id: limitValue
        textFormat: Text.PlainText
        text: limitRow.window ? limitRow.window.valueText : ""
        color: root.toneColor(limitRow.window ? limitRow.window.tone : "")
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
      }
    }

    Meter {
      visible: !!limitRow.window && limitRow.window.showMeter
      width: parent.width
      value: limitRow.window ? limitRow.window.fraction : 0
      fill: root.toneColor(limitRow.window ? limitRow.window.tone : "")
    }

    Text {
      textFormat: Text.PlainText
      visible: text !== ""
      width: parent.width
      text: limitRow.window ? root.joined([limitRow.window.detailText, limitRow.window.resetText]) : ""
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
    }
  }

  // Rounded track filled to `value`.
  component Meter: Item {
    id: meter
    property real value: 0
    property color fill: root.foreground
    property real thickness: Math.max(Style.space(4), Math.round(Style.spacing.controlHeight * 0.14))

    implicitHeight: thickness

    Rectangle {
      id: meterTrack
      anchors.fill: parent
      radius: height / 2
      color: root.track
    }

    Rectangle {
      anchors.left: meterTrack.left
      anchors.verticalCenter: meterTrack.verticalCenter
      height: meterTrack.height
      radius: meterTrack.radius
      width: meterTrack.width * root.clamp(meter.value, 0, 1)
      color: meter.fill

      Behavior on width {
        NumberAnimation { duration: 160; easing.type: Easing.OutCubic }
      }
    }
  }

  // A titled list of share rows: tools, models or projects.
  component ShareSection: Column {
    id: section
    property string title: ""
    property var rows: []

    visible: rows.length > 0
    width: parent ? parent.width : implicitWidth
    spacing: Style.spacing.md

    PanelSectionHeader {
      width: parent.width
      text: section.title
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Repeater {
      model: section.rows

      ShareRow {
        required property var modelData
        width: section.width
        row: modelData
      }
    }
  }

  // Share rows read as a table, as in the agents panel: the bar fills the row
  // behind the label, scaled to the heaviest row.
  component ShareRow: Item {
    id: shareRow
    property var row: null

    implicitHeight: shareName.implicitHeight + Style.spacing.lg

    Rectangle {
      anchors.fill: parent
      radius: Style.cornerRadius
      color: root.alpha(root.foreground, 0.05)
    }

    Rectangle {
      anchors.left: parent.left
      anchors.top: parent.top
      anchors.bottom: parent.bottom
      width: parent.width * root.clamp(shareRow.row ? shareRow.row.fraction : 0, 0, 1)
      radius: Style.cornerRadius
      color: shareRow.row && shareRow.row.color ? root.alpha(shareRow.row.color, 0.28) : root.alpha(root.foreground, 0.14)

      Behavior on width {
        NumberAnimation { duration: 160; easing.type: Easing.OutCubic }
      }
    }

    Text {
      id: shareName
      textFormat: Text.PlainText
      text: shareRow.row ? root.joined([shareRow.row.label, shareRow.row.clientLabel]) : ""
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      elide: Text.ElideRight
      anchors.left: parent.left
      anchors.leftMargin: Style.space(8)
      anchors.right: shareValue.left
      anchors.rightMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter
    }

    Text {
      id: shareValue
      textFormat: Text.PlainText
      text: shareRow.row ? shareRow.row.tokensText : ""
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      font.bold: true
      anchors.right: sharePercent.left
      anchors.rightMargin: sharePercent.visible ? Style.space(8) : 0
      anchors.verticalCenter: parent.verticalCenter
    }

    // Fixed width, so the percentages line up as a column.
    Text {
      id: sharePercent
      textFormat: Text.PlainText
      visible: !!shareRow.row && !!shareRow.row.shareText
      width: visible ? percentMetrics.width : 0
      text: shareRow.row && shareRow.row.shareText ? shareRow.row.shareText : ""
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      horizontalAlignment: Text.AlignRight
      anchors.right: parent.right
      anchors.rightMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter

      TextMetrics {
        id: percentMetrics
        font: sharePercent.font
        text: "100%"
      }
    }

    MouseArea {
      id: shareHover
      anchors.fill: parent
      hoverEnabled: true
      acceptedButtons: Qt.NoButton
    }

    PanelToolTip {
      visible: shareHover.containsMouse
      text: shareRow.row ? shareRow.row.costText : ""
      fontFamily: root.fontFamily
    }
  }

  // A session: live-state dot, title, tokens; model (or tool), project and
  // age underneath, with the prompt-cache countdown or context headroom
  // opposite.
  component SessionRow: Column {
    id: sessionRow
    property var session: null

    function stateColor(state) {
      if (state === "running") return root.accent
      if (state === "waiting") return root.urgent
      if (state === "ended") return root.dim
      return root.alpha(root.foreground, 0.25)
    }

    spacing: Style.spacing.xs

    Item {
      width: parent.width
      implicitHeight: sessionTitle.implicitHeight

      Rectangle {
        id: stateDot
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(7)
        height: width
        radius: width / 2
        color: sessionRow.stateColor(sessionRow.session ? sessionRow.session.state : "")
      }

      Text {
        id: sessionTitle
        textFormat: Text.PlainText
        anchors.left: stateDot.right
        anchors.leftMargin: Style.spacing.md
        anchors.right: sessionTokens.left
        anchors.rightMargin: Style.spacing.md
        text: sessionRow.session ? sessionRow.session.title : ""
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        elide: Text.ElideRight
      }

      Text {
        id: sessionTokens
        textFormat: Text.PlainText
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        text: sessionRow.session ? root.joined([sessionRow.session.tokensText, sessionRow.session.costText]) : ""
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
        font.bold: true
      }
    }

    Item {
      width: parent.width
      implicitHeight: sessionMeta.implicitHeight

      Text {
        id: sessionMeta
        textFormat: Text.PlainText
        anchors.left: parent.left
        anchors.leftMargin: Style.space(7) + Style.spacing.md
        anchors.right: sessionStatus.left
        anchors.rightMargin: Style.spacing.md
        text: sessionRow.session
          ? root.joined([sessionRow.session.modelLabel || sessionRow.session.clientLabel, sessionRow.session.project, sessionRow.session.lastUsedText])
          : ""
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }

      Text {
        id: sessionStatus
        textFormat: Text.PlainText
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        text: sessionRow.session ? (sessionRow.session.cacheText || sessionRow.session.contextText) : ""
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption

        MouseArea {
          id: statusHover
          anchors.fill: parent
          hoverEnabled: true
          acceptedButtons: Qt.NoButton
        }

        PanelToolTip {
          visible: statusHover.containsMouse && !!sessionRow.session && sessionRow.session.cacheHint !== ""
          text: sessionRow.session ? sessionRow.session.cacheHint : ""
          fontFamily: root.fontFamily
        }
      }
    }
  }

  // A section title with a dim note on the right ("25 active days").
  component SectionHead: Item {
    id: head
    property string title: ""
    property string meta: ""

    implicitHeight: headTitle.implicitHeight

    PanelSectionHeader {
      id: headTitle
      anchors.left: parent.left
      text: head.title
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Text {
      textFormat: Text.PlainText
      anchors.right: parent.right
      anchors.baseline: headTitle.baseline
      text: head.meta
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  // The rolling-year activity grid: one column per week, Sunday on top, cells
  // sized to fit the panel. Cells arrive in date order from the first Sunday,
  // so a cell's index is col * 7 + row.
  component Heatmap: Item {
    id: heat
    property var activity: null
    property int hovered: -1

    readonly property var cells: activity ? activity.cells : []
    readonly property int weeks: activity ? Math.max(1, activity.weeks) : 1
    readonly property real gap: Math.max(1, Style.space(2))
    readonly property real cell: Math.max(2, Math.floor((width - gap * (weeks - 1)) / weeks))
    readonly property real step: cell + gap

    function levelColor(level) {
      if (level >= 4) return root.accent
      if (level === 3) return root.alpha(root.accent, 0.72)
      if (level === 2) return root.alpha(root.accent, 0.48)
      if (level === 1) return root.alpha(root.accent, 0.28)
      return root.alpha(root.foreground, 0.07)
    }

    implicitHeight: grid.height + Style.spacing.xs + monthRow.implicitHeight

    Item {
      id: grid
      // Right-aligned so today sits at the edge, like the Electron view.
      anchors.right: parent.right
      width: heat.weeks * heat.step - heat.gap
      height: 7 * heat.step - heat.gap

      Repeater {
        model: heat.cells

        Rectangle {
          required property var modelData
          required property int index
          x: modelData.col * heat.step
          y: modelData.row * heat.step
          width: heat.cell
          height: heat.cell
          radius: Math.max(1, heat.cell / 4)
          color: heat.levelColor(modelData.level)
          border.width: modelData.today || index === heat.hovered ? 1 : 0
          border.color: root.foreground
        }
      }

      MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.NoButton
        onPositionChanged: function(mouse) {
          var index = Math.floor(mouse.x / heat.step) * 7 + Math.floor(mouse.y / heat.step)
          heat.hovered = index >= 0 && index < heat.cells.length ? index : -1
        }
        onExited: heat.hovered = -1
      }

      Item {
        x: heat.hovered >= 0 ? heat.cells[heat.hovered].col * heat.step : 0
        y: heat.hovered >= 0 ? heat.cells[heat.hovered].row * heat.step : 0
        width: heat.cell
        height: heat.cell

        PanelToolTip {
          visible: heat.hovered >= 0
          text: heat.hovered >= 0 ? heat.cells[heat.hovered].tooltip : ""
          fontFamily: root.fontFamily
        }
      }
    }

    Item {
      id: monthRow
      anchors.top: grid.bottom
      anchors.topMargin: Style.spacing.xs
      anchors.left: grid.left
      width: grid.width
      implicitHeight: Style.font.caption + Style.spacing.xs

      Repeater {
        model: heat.activity ? heat.activity.months : []

        Text {
          required property var modelData
          textFormat: Text.PlainText
          x: modelData.col * heat.step
          text: modelData.label
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }
  }

  // The trend line: the bridge sends a smoothed path in 0..1 units and this
  // only scales it to the chart box, with a fading fill underneath.
  component TrendChart: Item {
    id: chart
    property var steps: []
    readonly property real inset: Style.space(3)
    readonly property real lineWidth: Math.max(2, Style.space(2.5))
    readonly property color lineColor: root.accent
    readonly property color fillTop: root.alpha(root.accent, 0.32)
    readonly property color fillBottom: root.alpha(root.accent, 0)

    function svg(closed) {
      var w = chart.width
      var h = chart.height - chart.inset * 2
      var out = []
      for (var i = 0; i < chart.steps.length; i++) {
        var step = chart.steps[i]
        var coords = []
        for (var j = 0; j + 1 < step.args.length; j += 2)
          coords.push((step.args[j] * w).toFixed(2) + "," + (chart.inset + step.args[j + 1] * h).toFixed(2))
        out.push(step.op + coords.join(" "))
      }
      if (closed && out.length > 0) out.push("L" + w.toFixed(2) + "," + chart.height.toFixed(2) + " L0," + chart.height.toFixed(2) + " Z")
      return out.join(" ")
    }

    Shape {
      anchors.fill: parent
      preferredRendererType: Shape.CurveRenderer

      ShapePath {
        strokeWidth: -1
        strokeColor: "transparent"
        fillGradient: LinearGradient {
          x1: 0; y1: 0
          x2: 0; y2: chart.height
          GradientStop { position: 0; color: chart.fillTop }
          GradientStop { position: 1; color: chart.fillBottom }
        }
        PathSvg { path: chart.svg(true) }
      }

      ShapePath {
        strokeWidth: chart.lineWidth
        strokeColor: chart.lineColor
        fillColor: "transparent"
        capStyle: ShapePath.RoundCap
        joinStyle: ShapePath.RoundJoin
        PathSvg { path: chart.svg(false) }
      }
    }
  }
}
