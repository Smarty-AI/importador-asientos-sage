import { describe, it, expect } from "vitest";
import XLSX from "xlsx";
import {
  parseWorkbook,
  groupByOrden,
  EXPECTED_HEADERS,
  checkHeaders,
} from "../docs/src/parser.js";

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

describe("parseWorkbook — rowNumber", () => {
  it("attaches Excel rowNumber with header as row 1 and first data row as row 2", () => {
    const buffer = buildWorkbookArrayBuffer([
      HEADER,
      [1, "2026-01-15", "Row one", "11010001", "Caja", 1000, null],
      [1, "2026-01-15", "Row two", "21010001", "Proveedores", null, 1000],
    ]);

    const rows = parseWorkbook(buffer, XLSX);

    expect(rows[0].rowNumber).toBe(2);
    expect(rows[1].rowNumber).toBe(3);
  });
});

describe("checkHeaders — pure header comparison", () => {
  it("returns ok for the exact expected header row", () => {
    const result = checkHeaders([...EXPECTED_HEADERS]);

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });

  it("detects a missing column and an unexpected column", () => {
    const received = [...EXPECTED_HEADERS.filter((h) => h !== "Debe"), "Extra"];
    const result = checkHeaders(received);

    expect(result.ok).toBe(false);
    expect(result.missing).toContain("Debe");
    expect(result.unexpected).toContain("Extra");
  });

  it("flags a reordered header row as a mismatch", () => {
    const received = [...EXPECTED_HEADERS].reverse();
    const result = checkHeaders(received);

    expect(result.ok).toBe(false);
  });

  it("stays consistent with the downloadable template header", async () => {
    const { TEMPLATE_HEADER } = await import("../docs/src/template-builder.js");

    expect(EXPECTED_HEADERS).toEqual(TEMPLATE_HEADER);
  });
});

describe("parseWorkbook — named guards", () => {
  it("throws a single blocking header-mismatch error listing expected vs received", () => {
    const buffer = buildWorkbookArrayBuffer([
      ["Wrong", "Headers", "Here"],
      [1, "x", "y"],
    ]);

    expect(() => parseWorkbook(buffer, XLSX)).toThrow(/Encabezados|header/i);
    try {
      parseWorkbook(buffer, XLSX);
    } catch (err) {
      // Single error must name both sides so the user can fix the file.
      expect(err.message).toMatch(/esperado/i);
      expect(err.message).toMatch(/recibido/i);
    }
  });

  it("throws an actionable error on an empty workbook with no sheets", () => {
    const emptyWorkbook = XLSX.utils.book_new();

    expect(() =>
      parseWorkbook(XLSX.write(emptyWorkbook, { type: "array", bookType: "xlsx" }), XLSX)
    ).toThrow(/vacío|empty|hoja|sheet/i);
  });

  it("throws an actionable error when only the header row exists (zero data rows)", () => {
    const buffer = buildWorkbookArrayBuffer([HEADER]);

    expect(() => parseWorkbook(buffer, XLSX)).toThrow(/fila|row/i);
  });
});

describe("parseWorkbook — Errores column tolerance (resubmittable error workbook)", () => {
  it("ignores a trailing Errores column instead of rejecting the file", () => {
    const buffer = buildWorkbookArrayBuffer([
      [...HEADER, "Errores"],
      [1, "2026-01-15", "Ajuste caja", "11010001", "Caja Tesoreria", 1000, null, "Fecha inválida"],
      [1, "2026-01-15", "Ajuste caja", "21010001", "Proveedores", null, 1000, ""],
    ]);

    const rows = parseWorkbook(buffer, XLSX);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ nOrden: 1, concepto: "Ajuste caja", debe: 1000 });
    // The Errores payload never leaks into the domain object...
    expect(rows[0]).not.toHaveProperty("Errores");
    expect(rows[0]).not.toHaveProperty("errores");
    // ...and grouping still works.
    expect(groupByOrden(rows)).toHaveLength(1);
  });

  it("tolerates case/whitespace variants of the Errores header", () => {
    for (const erroresHeader of ["ERRORES", " errores ", "  Errores  "]) {
      const buffer = buildWorkbookArrayBuffer([
        [...HEADER, erroresHeader],
        [2, "2026-01-16", "Ajuste banco", "11010002", "Banco", 500, null, "algo"],
      ]);

      const rows = parseWorkbook(buffer, XLSX);

      expect(rows).toHaveLength(1);
      expect(rows[0].nOrden).toBe(2);
    }
  });

  it("still maps data columns when expected headers vary in case/spacing", () => {
    const buffer = buildWorkbookArrayBuffer([
      ["N° Orden", "  fecha ", "CONCEPTO", "Código Cuenta", "Denominación de Cuenta", "DEBE", "haber"],
      [3, "2026-01-17", "Mixto", "11010003", "Caja 3", 700, null],
    ]);

    const rows = parseWorkbook(buffer, XLSX);

    expect(rows[0]).toMatchObject({
      nOrden: 3,
      concepto: "Mixto",
      codigoCuenta: "11010003",
      debe: 700,
    });
  });
});

describe("checkHeaders — Errores tolerance", () => {
  it("returns ok when the only extra column is Errores", () => {
    const result = checkHeaders([...EXPECTED_HEADERS, "Errores"]);

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });

  it("returns ok for case/whitespace variants of Errores", () => {
    expect(checkHeaders([...EXPECTED_HEADERS, "ERRORES"]).ok).toBe(true);
    expect(checkHeaders([...EXPECTED_HEADERS, " errores "]).ok).toBe(true);
  });

  it("still flags a genuinely unexpected column next to Errores", () => {
    const result = checkHeaders([...EXPECTED_HEADERS, "Errores", "Extra"]);

    expect(result.ok).toBe(false);
    expect(result.unexpected).toContain("Extra");
    expect(result.unexpected).not.toContain("Errores");
  });

  it("still flags a missing expected column even with Errores present", () => {
    const received = [...EXPECTED_HEADERS.filter((h) => h !== "Debe"), "Errores"];
    const result = checkHeaders(received);

    expect(result.ok).toBe(false);
    expect(result.missing).toContain("Debe");
  });

  it("compares expected headers case/whitespace-insensitively", () => {
    const received = EXPECTED_HEADERS.map((h) => `  ${h.toLowerCase()}  `);

    expect(checkHeaders(received).ok).toBe(true);
  });
});
