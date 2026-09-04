#!/bin/sh
# Deterministic stand-in for a real processor tool image: ignores every
# argument it's called with (the worker always calls tools with --key value
# flags derived from processor configuration) and writes fixed, known output
# so the e2e pipeline test can assert on exact file contents/checksums.
set -e

# Controllable purely through Cmd[0] (the processor's configured "command"),
# since the test has no way to inject container env vars through the
# worker's public API.
if [ "$1" = "autodroid-e2e-stdout-only" ]; then
  echo "synthetic-stdout-only-output"
  exit 0
fi

mkdir -p /output

echo "synthetic-result-row-1,synthetic-result-row-2" > /output/result.csv
echo "synthetic-metric-row-1,synthetic-metric-row-2" > /output/metrics.csv

if [ "$1" = "autodroid-e2e-force-fail" ]; then
  exit 7
fi

exit 0
