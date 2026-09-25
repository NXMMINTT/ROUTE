const COLUMNS = ["instance", "customers", "capacity", "vehicles", "distance", "optimal", "gap_percent", "feasible", "time_limit_s", "elapsed_s"];

const cell = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** ดาวน์โหลดผล benchmark เป็น CSV (มี BOM ให้ Excel อ่าน UTF-8 ถูก) records: [{ instance, row, gap }] */
export function downloadCsv(records) {
  const lines = records.map(({ instance: it, row, gap }) => {
    const r = row.result;
    return [
      it.name,
      it.customers,
      it.capacity,
      r.routes.length,
      r.distance.toFixed(2),
      it.optimal,
      gap == null ? null : gap.toFixed(4),
      r.feasible,
      row.timeLimit,
      r.elapsed.toFixed(2),
    ]
      .map(cell)
      .join(",");
  });
  const csv = "﻿" + [COLUMNS.join(","), ...lines].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `benchmark-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
