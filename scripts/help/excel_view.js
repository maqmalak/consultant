// Draws a sheet of an .xlsx as an Excel-like page (ribbon, column letters, row numbers, sheet tabs) for the guides and
// videos, so they can show what the filled template looks like. The cells are read with openpyxl from the bench's Python.
const { execFileSync } = require("child_process");
const path = require("path");

const PY = process.env.BENCH_PY || path.join(__dirname, "..", "..", "..", "..", "env", "bin", "python");
const READ = `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
out = {"tabs": [ws.title for ws in wb if ws.sheet_state == "visible"], "sheets": {}}
for ws in wb:
    rows = [["" if v is None else (f"{v:,}" if isinstance(v, int) and v > 9999 else str(v)) for v in r] for r in ws.iter_rows(values_only=True)]
    while rows and not any(rows[-1]): rows.pop()
    out["sheets"][ws.title] = rows
print(json.dumps(out))`;

const cache = {};
function load(file) {
  if (!cache[file]) cache[file] = JSON.parse(execFileSync(PY, ["-I", "-c", READ, file], { encoding: "utf8", stderr: "ignore" }));
  return cache[file];
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const letter = (i) => String.fromCharCode(65 + i);

// opts: { cols: number of columns to show, mark: [column indexes to highlight], note: text for the callout, file name }
function sheetHtml(file, sheet, opts = {}) {
  const wb = load(file);
  const rows = wb.sheets[sheet] || [];
  const ncol = Math.min(opts.cols || (rows[0] || []).length, (rows[0] || []).length || 10);
  const mark = new Set(opts.mark || []);
  const isInfo = sheet === "Instructions";
  const body = [];
  const shown = Math.max(rows.length + 3, 16);
  for (let r = 0; r < shown; r++) {
    const row = rows[r] || [];
    const cells = isInfo
      ? `<td class="c" colspan="${ncol}" style="${r === 0 ? "font-size:20px;font-weight:700" : /^Example|^Data/.test(row[0] || "") ? "font-weight:700" : ""}">${esc([row[0], ...row.slice(1).filter(Boolean)].filter(Boolean).join("   ·   "))}</td>`
      : Array.from({ length: ncol }, (_, c) => {
        const v = row[c] ?? "";
        const head = r === 0;
        const cls = ["c", head ? (v.endsWith("*") ? "h req" : "h") : "", mark.has(c) ? "mk" : "", /^[\d,]+$/.test(v) && c > 7 ? "num" : ""].join(" ");
        return `<td class="${cls}">${esc(v)}</td>`;
      }).join("");
    body.push(`<tr><th class="rn">${r + 1}</th>${cells}</tr>`);
  }
  const tabs = wb.tabs.map((t) => `<span class="tab${t === sheet ? " on" : ""}">${esc(t)}</span>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;height:100vh;display:flex;flex-direction:column;font:${opts.small ? 11.5 : 13}px Calibri,Carlito,Segoe UI,Arial,sans-serif;background:#fff;color:#1f1f1f}
  .bar{background:#1d6f42;color:#fff;padding:9px 16px;display:flex;align-items:center;gap:12px;font-size:14px}
  .bar .x{width:26px;height:26px;border-radius:5px;background:#fff;color:#1d6f42;display:grid;place-items:center;font-weight:800}
  .bar .f{opacity:.9}.bar .s{margin-left:auto;font-size:12px;opacity:.8}
  .rib{background:#f3f3f3;border-bottom:1px solid #d6d6d6;padding:6px 16px;display:flex;gap:22px;color:#444;font-size:12.5px}
  .rib b{color:#1d6f42;border-bottom:2px solid #1d6f42;padding-bottom:3px}
  .fx{display:flex;align-items:center;border-bottom:1px solid #d6d6d6;font-size:12.5px}
  .fx .nm{width:80px;padding:5px 8px;border-right:1px solid #d6d6d6;color:#555}.fx .v{padding:5px 10px;color:#333}
  .grid{flex:1;overflow:hidden}
  table{border-collapse:collapse;table-layout:auto}
  th{background:#f0f0f0;color:#666;font-weight:400;border:1px solid #dadada;padding:3px 6px;font-size:12px}
  .rn{width:38px;text-align:center}
  .c{border:1px solid #e1e1e1;padding:5px ${opts.small ? 6 : 9}px;white-space:nowrap;height:27px}
  .h{background:#141416;color:#fff;font-weight:700}.h.req{color:#f3d77a}
  .mk{background:#fff7d6}.h.mk{background:#3a2f0c}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .tabs{border-top:1px solid #d6d6d6;background:#f3f3f3;display:flex;gap:2px;padding:0 16px}
  .tab{padding:6px 18px;color:#555}.tab.on{background:#fff;color:#1d6f42;font-weight:700;border-bottom:3px solid #1d6f42}
  .note{position:fixed;right:28px;bottom:70px;max-width:380px;background:#141416;color:#fff;border:1px solid rgba(212,175,55,.7);border-radius:14px;padding:12px 16px;font-size:15px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.25)}
  .note b{color:#f3d77a}
  </style></head><body>
  <div class="bar"><span class="x">X</span><span class="f">${esc(opts.file || "VVS_data_import_template.xlsx")}</span><span class="s">Excel</span></div>
  <div class="rib"><span>File</span><b>Home</b><span>Insert</span><span>Page Layout</span><span>Formulas</span><span>Data</span><span>Review</span><span>View</span></div>
  <div class="fx"><span class="nm">A1</span><span class="v">${esc((rows[0] || [])[0] || "")}</span></div>
  <div class="grid"><table><tr><th></th>${isInfo ? `<th colspan="${ncol}" style="text-align:left">A</th>` : Array.from({ length: ncol }, (_, i) => `<th>${letter(i)}</th>`).join("")}</tr>${body.join("")}</table></div>
  <div class="tabs">${tabs}</div>
  ${opts.note ? `<div class="note">${opts.note}</div>` : ""}
  </body></html>`;
}

module.exports = { sheetHtml };
