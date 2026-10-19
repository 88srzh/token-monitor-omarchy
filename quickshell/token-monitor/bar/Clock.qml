import QtQuick
import Quickshell
import qs.components

// Waybar's clock: "Monday 14:05", click for "19 October W43 2026", right click
// for Omarchy's timezone picker.
BarIcon {
    id: root

    property bool alternate: false

    leftMargin: 8.75
    rightMargin: 0
    text: alternate
        ? Qt.formatDate(clock.date, "dd MMMM") + " W" + isoWeek(clock.date) + " " + Qt.formatDate(clock.date, "yyyy")
        : Qt.formatDateTime(clock.date, "dddd HH:mm")
    onClicked: alternate = !alternate
    onRightClicked: Quickshell.execDetached(["omarchy-launch-floating-terminal-with-presentation", "omarchy-tz-select"])

    function isoWeek(date) {
        const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        day.setDate(day.getDate() + 3 - (day.getDay() + 6) % 7);
        const firstThursday = new Date(day.getFullYear(), 0, 4);
        const week = 1 + Math.round(((day - firstThursday) / 86400000 - 3 + (firstThursday.getDay() + 6) % 7) / 7);
        return week < 10 ? "0" + week : String(week);
    }

    SystemClock {
        id: clock
        precision: SystemClock.Minutes
    }
}
