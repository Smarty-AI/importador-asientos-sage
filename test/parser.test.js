import { describe, it, expect } from "vitest";
import XLSX from "xlsx";
import { parseWorkbook, groupByOrden } from "../docs/src/parser.js";

// `parser.js` never imports an XLSX library itself (no bundler, no global
// assumptions) — it receives the library as an explicit dependency, matching
// how `ui.js` will pass in the vendored `window.XLSX` at runtime. Tests pass
// the npm `xlsx` package instead (same SheetJS API surface).
function buildWorkbookArrayBuffer(rows) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Hoja1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

const HEADER = [
  "N° Orden",
  "Fecha",
  "Concepto",
  "Código Cuenta",
  "Denominación de Cuenta",
  "Debe",
  "Haber",
];

describe("parseWorkbook", () => {
  it("parses every row into a RawRow object with normalized field names", () => {
    const buffer = buildWorkbookArrayBuffer([
      HEADER,
      [1, "2026-01-15", "Ajuste caja", "11010001", "Caja Tesoreria", 1000, null],
      [1, "2026-01-15", "Ajuste caja", "21010001", "Proveedores", null, 1000],
    ]);

    const rows = parseWorkbook(buffer, XLSX);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      nOrden: 1,
      concepto: "Ajuste caja",
      codigoCuenta: "11010001",
      denominacionCuenta: "Caja Tesoreria",
      debe: 1000,
      haber: null,
    });
  });

  it("accepts a missing Denominación de Cuenta as undefined/blank", () => {
    const buffer = buildWorkbookArrayBuffer([
      HEADER,
      [2, "2026-01-16", "Ajuste sin denominacion", "11010002", null, 500, null],
    ]);

    const rows = parseWorkbook(buffer, XLSX);

    expect(rows[0].denominacionCuenta == null || rows[0].denominacionCuenta === "").toBe(true);
  });
});

describe("groupByOrden", () => {
  it("groups multiple lines sharing the same N° Orden into one entry", () => {
    const rows = [
      { nOrden: 1, codigoCuenta: "11010001", debe: 1000, haber: null },
      { nOrden: 1, codigoCuenta: "21010001", debe: null, haber: 1000 },
      { nOrden: 2, codigoCuenta: "11010002", debe: 500, haber: null },
    ];

    const groups = groupByOrden(rows);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ nOrden: 1, lines: [rows[0], rows[1]] });
    expect(groups[1]).toEqual({ nOrden: 2, lines: [rows[2]] });
  });

  it("preserves insertion order of first appearance across non-contiguous rows", () => {
    const rows = [
      { nOrden: 2, codigoCuenta: "A", debe: 1, haber: null },
      { nOrden: 1, codigoCuenta: "B", debe: 2, haber: null },
      { nOrden: 2, codigoCuenta: "C", debe: null, haber: 1 },
    ];

    const groups = groupByOrden(rows);

    expect(groups.map((g) => g.nOrden)).toEqual([2, 1]);
    expect(groups[0].lines).toHaveLength(2);
  });
});
