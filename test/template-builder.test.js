import { describe, it, expect } from "vitest";
import XLSX from "xlsx";
import {
  buildErrorWorkbook,
  buildTemplateWorkbook,
  ERROR_COLUMN,
  ERROR_HEADER,
  messagesForRow,
} from "../docs/src/template-builder.js";

// `template-builder.js` never imports an XLSX library itself (no bundler, no
// global assumptions) — it receives the library as an explicit dependency,
// matching the pattern used by `parser.js`. Tests pass the npm `xlsx`
// package; the browser uses the vendored `window.XLSX` at runtime.

const EXPECTED_HEADER = [
  "N° Orden",
  "Fecha",
  "Concepto",
  "Código Cuenta",
  "Denominación de Cuenta",
  "Debe",
  "Haber",
];

describe("buildTemplateWorkbook", () => {
  it("produces a workbook whose first sheet has exactly the expected header row, in order", () => {
    const workbook = buildTemplateWorkbook(XLSX);

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    expect(rows[0]).toEqual(EXPECTED_HEADER);
  });

  it("contains no data rows beyond the header", () => {
    const workbook = buildTemplateWorkbook(XLSX);

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    expect(rows).toHaveLength(1);
  });
});

function makeGroups() {
  return [
    {
      nOrden: 1,
      lines: [
        {
          nOrden: 1,
          fecha: "2026-01-15",
          concepto: "Ajuste caja",
          codigoCuenta: "11010001",
          denominacionCuenta: "Caja",
          debe: 1000,
          haber: null,
          rowNumber: 2,
        },
        {
          nOrden: 1,
          fecha: "2026-01-15",
          concepto: "Ajuste caja",
          codigoCuenta: "21010001",
          denominacionCuenta: "Proveedores",
          debe: null,
          haber: 1000,
          rowNumber: 3,
        },
      ],
    },
    {
      nOrden: 2,
      lines: [
        {
          nOrden: 2,
          fecha: "2026-01-16",
          concepto: "Ajuste banco",
          codigoCuenta: "11010002",
          denominacionCuenta: "Banco",
          debe: 500,
          haber: null,
          rowNumber: 4,
        },
      ],
    },
  ];
}

describe("messagesForRow — pure per-row issue lookup", () => {
  const issues = {
    errors: [
      { nOrden: 1, rowNumber: 2, field: "fecha", message: "Fecha inválida" },
      { nOrden: 2, rowNumber: 4, field: "concepto", message: "Concepto vacío" },
    ],
    warnings: [{ nOrden: 1, rowNumber: 3, field: "codigoCuenta", message: "Cuenta no encontrada" }],
  };

  it("collects only the issues matching the rowNumber", () => {
    expect(messagesForRow(2, 1, issues)).toMatchObject({
      messages: ["Fecha inválida"],
      hasError: true,
      hasWarning: false,
    });
    expect(messagesForRow(3, 1, issues)).toMatchObject({
      messages: ["Cuenta no encontrada"],
      hasError: false,
      hasWarning: true,
    });
  });

  it("returns empty messages and no flags for a clean row", () => {
    // Row 99 has no issue attached.
    expect(messagesForRow(99, 99, issues)).toEqual({
      messages: [],
      hasError: false,
      hasWarning: false,
    });
  });

  it("joins through the nOrden fallback when an issue lacks rowNumber", () => {
    const fallback = { errors: [{ nOrden: 2, message: "Asiento desbalanceado" }], warnings: [] };

    expect(messagesForRow(null, 2, fallback).messages).toEqual(["Asiento desbalanceado"]);
    expect(messagesForRow(null, 1, fallback).messages).toEqual([]);
  });

  it("accepts a flat issue array using issue.severity", () => {
    const flat = [
      { nOrden: 1, rowNumber: 2, message: "Algo roto" },
      { nOrden: 1, rowNumber: 3, severity: "warning", message: "Solo aviso" },
    ];

    expect(messagesForRow(2, 1, flat).hasError).toBe(true);
    expect(messagesForRow(3, 1, flat)).toMatchObject({
      messages: ["Solo aviso"],
      hasError: false,
      hasWarning: true,
    });
  });
});

describe("buildErrorWorkbook", () => {
  const issues = {
    errors: [
      { nOrden: 1, rowNumber: 2, field: "fecha", message: "Fecha inválida" },
      { nOrden: 2, rowNumber: 4, field: "concepto", message: "Concepto vacío" },
    ],
    warnings: [{ nOrden: 1, rowNumber: 3, field: "codigoCuenta", message: "Cuenta no encontrada" }],
  };

  it("uses TEMPLATE_HEADER plus a trailing Errores column", () => {
    const workbook = buildErrorWorkbook(XLSX, makeGroups(), issues);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    expect(rows[0]).toEqual([...EXPECTED_HEADER, ERROR_COLUMN]);
    expect(ERROR_HEADER[ERROR_HEADER.length - 1]).toBe("Errores");
  });

  it("emits one row per original line in order, with pipe-joined messages", () => {
    const workbook = buildErrorWorkbook(XLSX, makeGroups(), issues);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // defval:null keeps blank Debe/Haber cells as null instead of holes.
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // Header + 3 data rows, same line order as the groups.
    expect(rows).toHaveLength(4);
    expect(rows[1][7]).toBe("Fecha inválida");
    expect(rows[1].slice(0, 7)).toEqual([1, "2026-01-15", "Ajuste caja", "11010001", "Caja", 1000, null]);
    expect(rows[2][7]).toBe("Cuenta no encontrada");
    expect(rows[3][7]).toBe("Concepto vacío");
  });

  it("leaves the Errores cell empty when the row has no issue", () => {
    const workbook = buildErrorWorkbook(XLSX, makeGroups(), { errors: [], warnings: [] });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // defval:"" keeps trailing empties visible instead of dropping the key.
    const records = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record["Errores"]).toBe("");
    }
  });

  it("joins several messages for the same row with ' | '", () => {
    const multi = {
      errors: [
        { nOrden: 1, rowNumber: 2, field: "fecha", message: "Fecha inválida" },
        { nOrden: 1, rowNumber: 2, field: "concepto", message: "Concepto vacío" },
      ],
      warnings: [],
    };
    const workbook = buildErrorWorkbook(XLSX, makeGroups(), multi);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    expect(rows[1][7]).toBe("Fecha inválida | Concepto vacío");
  });

  it("colors error rows red, warning-only rows yellow, clean rows unstyled (best-effort)", () => {
    const workbook = buildErrorWorkbook(XLSX, makeGroups(), issues);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Header: dark-blue fill + bold white font.
    expect(sheet["A1"].s.fill.fgColor.rgb).toBe("FF1F4E79");
    expect(sheet["A1"].s.font).toMatchObject({ color: { rgb: "FFFFFFFF" }, bold: true });
    // Row 2 (Excel row 2): blocking error -> light-red fill + dark-red font.
    expect(sheet["A2"].s.fill.fgColor.rgb).toBe("FFFFCCCC");
    expect(sheet["A2"].s.font.color.rgb).toBe("FF9B0000");
    // Row 3 (Excel row 3): warning only -> light-yellow fill + brown font.
    expect(sheet["A3"].s.fill.fgColor.rgb).toBe("FFFFF2CC");
    expect(sheet["A3"].s.font.color.rgb).toBe("FF7F6000");
  });

  it("leaves clean rows without fill", () => {
    const cleanOnly = { errors: [], warnings: [] };
    const workbook = buildErrorWorkbook(XLSX, makeGroups(), cleanOnly);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    expect(sheet["A2"].s).toBeUndefined();
    expect(sheet["A3"].s).toBeUndefined();
    expect(sheet["A4"].s).toBeUndefined();
  });

  it("sets reasonable column widths without crashing", () => {
    const workbook = buildErrorWorkbook(XLSX, makeGroups(), issues);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    expect(sheet["!cols"]).toHaveLength(8);
    expect(sheet["!cols"][7].wch).toBeGreaterThanOrEqual(40);
  });

  it("never throws when the style layer fails (graceful degradation)", () => {
    // Minimal stub: utils without a working decode_range forces the style
    // pass to throw; the workbook must still come back usable.
    const stub = {
      utils: {
        ...XLSX.utils,
        decode_range: () => {
          throw new Error("no styles here");
        },
      },
    };
    const workbook = buildErrorWorkbook(stub, makeGroups(), issues);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    expect(rows[0][7]).toBe("Errores");
    expect(rows).toHaveLength(4);
  });

  it("round-trips through write + parseWorkbook: the Errores column is ignored on re-upload", async () => {
    const { parseWorkbook, groupByOrden } = await import("../docs/src/parser.js");
    const workbook = buildErrorWorkbook(XLSX, makeGroups(), issues);
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });

    const rows = parseWorkbook(buffer, XLSX);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ nOrden: 1, concepto: "Ajuste caja", debe: 1000 });
    expect(groupByOrden(rows)).toHaveLength(2);
  });
});
