// Ranks logic files that are below 100% coverage from the v8 json-summary,
// so the coverage campaign is resumable and measurable.
//
//   node scripts/coverage-gaps.mjs [--by-dir] [--top=N]
//
// Reads test/outputs/coverage/coverage-summary.json (written by `yarn test`
// with the json-summary reporter). Exit code 1 when any gap remains.

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

const cwd = process.cwd();
const summaryPath = join(cwd, "test/outputs/coverage/coverage-summary.json");

const args = process.argv.slice(2);
const byDir = args.includes("--by-dir");
const topArg = args.find(a => a.startsWith("--top="));
const top = topArg ? Number(topArg.split("=")[1]) : Infinity;

let summary;
try {
  summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
} catch (error) {
  console.error(`Cannot read ${summaryPath}: ${error.message}`);
  console.error("Run `yarn test` (json-summary reporter) first.");
  process.exit(2);
}

const metricGap = m => (m ? m.total - m.covered : 0);

const files = Object.entries(summary)
  .filter(([key]) => key !== "total")
  .map(([path, m]) => ({
    path: path.startsWith("/") ? relative(cwd, path) : path,
    linesPct: m.lines.pct,
    fnPct: m.functions.pct,
    branchPct: m.branches.pct,
    uncovered:
      metricGap(m.lines) + metricGap(m.functions) + metricGap(m.branches),
    lineGap: metricGap(m.lines),
    fnGap: metricGap(m.functions),
    branchGap: metricGap(m.branches),
  }));

const gaps = files
  .filter(f => f.linesPct < 100 || f.fnPct < 100 || f.branchPct < 100)
  .sort((a, b) => b.uncovered - a.uncovered);

const t = summary.total;
const pct = m => `${m.pct.toFixed(2)}%`;
console.log("=== Coverage totals (logic scope) ===");
console.log(
  `lines ${pct(t.lines)}  functions ${pct(t.functions)}  branches ${pct(
    t.branches,
  )}  statements ${pct(t.statements)}`,
);
console.log(`files measured: ${files.length}   files below 100%: ${gaps.length}`);

if (byDir) {
  const dirs = new Map();
  for (const f of gaps) {
    const dir = f.path.split("/").slice(0, 4).join("/");
    const acc = dirs.get(dir) || { files: 0, uncovered: 0 };
    acc.files += 1;
    acc.uncovered += f.uncovered;
    dirs.set(dir, acc);
  }
  console.log("\n=== Gaps by directory (uncovered units desc) ===");
  [...dirs.entries()]
    .sort((a, b) => b[1].uncovered - a[1].uncovered)
    .slice(0, top)
    .forEach(([dir, a]) =>
      console.log(`${String(a.uncovered).padStart(6)}  ${a.files} files  ${dir}`),
    );
} else {
  console.log("\n=== Files below 100% (uncovered units desc) ===");
  console.log("  L%    F%    B%   path");
  gaps
    .slice(0, top)
    .forEach(f =>
      console.log(
        `${f.linesPct.toFixed(0).padStart(4)} ${f.fnPct
          .toFixed(0)
          .padStart(5)} ${f.branchPct.toFixed(0).padStart(5)}   ${f.path}`,
      ),
    );
}

process.exit(gaps.length === 0 ? 0 : 1);
