#!/bin/sh

forward_signals() {
  echo "Forwarding SIGTERM to node process $node_pid"
  kill -s SIGTERM "$node_pid" 2>/dev/null
  wait "$node_pid" 2>/dev/null
}

node index.js $@ &
NODE_PID=$!

trap forward_signals SIGTERM SIGINT

wait "$NODE_PID"
