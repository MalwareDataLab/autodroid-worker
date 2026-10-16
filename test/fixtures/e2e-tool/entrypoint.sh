#!/bin/sh
set -e

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
