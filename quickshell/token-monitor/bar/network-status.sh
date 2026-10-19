#!/bin/sh
# Prints "<kind> <link quality> <interface>" for the bar's network module:
# ethernet wins over wifi, and only interfaces backed by a device count, which
# skips docker, veth and tunnels. Read from sysfs rather than a network manager
# because Omarchy uses iwd.
wifi=''
wired=''
for dir in /sys/class/net/*; do
    name=${dir##*/}
    [ -e "$dir/device" ] || continue
    [ "$(cat "$dir/operstate" 2>/dev/null)" = up ] || continue
    if [ -d "$dir/wireless" ]; then wifi=$name; else wired=$name; fi
done

if [ -n "$wired" ]; then
    echo "ethernet 0 $wired"
elif [ -n "$wifi" ]; then
    link=$(awk -v name="$wifi:" '$1 == name { print int($3) }' /proc/net/wireless)
    echo "wifi ${link:-0} $wifi"
else
    echo "disconnected 0"
fi
