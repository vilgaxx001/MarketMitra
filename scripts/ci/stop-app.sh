#!/usr/bin/env bash
# Stop the server started by start-app.sh (only that pid; never pattern-kills other processes).
state="${RUNNER_TEMP:-/tmp}/mm-ci"
if [ -f "$state/server.pid" ]; then pid="$(cat "$state/server.pid")"; kill "$pid" 2>/dev/null && echo "stopped server $pid" || echo "server $pid was not running"; rm -f "$state/server.pid"; else echo "no server pid file"; fi
exit 0
