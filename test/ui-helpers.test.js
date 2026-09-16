import { describe, it, expect } from "vitest";
import {
  getDefaultBatchConfig,
  resolveBatchConfig,
  formatIssue,
  groupIssues,
  formatGroupSummary,
  shouldEnableErrorsDownload,
} from "../docs/src/ui.js";

// Only the DOM-free pure helpers extracted from `ui.js` are unit-tested here.
// `ui.js`'s DOM-wiring code is guarded (`typeof document !== "undefined"`)
// and covered only by manual smoke test, per design.

describe("getDefaultBatchConfig", () => {
  it("returns the confirmed batch-header defaults", () => {
    expect(getDefaultBatchConfig()).toEqual({
      TYP: "AJU",
      FCY: "CEN",
      JOU: "ODG",
      DACDIA: "STDCO",
      CUR: "ARS",
    });
  });
});

describe("resolveBatchConfig", () => {
  it("falls back to defaults when no form values are provided", () => {
    expect(resolveBatchConfig({})).toEqual(getDefaultBatchConfig());
  });

  it("overrides a default with a non-blank user-provided value", () => {
    const result = resolveBatchConfig({ JOU: "DIA" });

    expect(result.JOU).toBe("DIA");
    expect(result.TYP).toBe("AJU");
  });

  it("ignores a blank/whitespace-only override and keeps the default", () => {
    const result = resolveBatchConfig({ CUR: "   " });

    expect(result.CUR).toBe("ARS");
  });
});

describe("formatIssue — pure per-row error sentence", () => {
  it("renders Excel row, entry number, field and message in one actionable line", () => {
    const text = formatIssue({
      nOrden: 1,
      rowNumber: 3,
      field: "fecha",
      message: 'Fecha inválida (recibido: "abc"; esperado: fecha ISO o fecha Excel)',
    });

    expect(text).toMatch(/Fila Excel 3/);
    expect(text).toMatch(/Asiento 1/);
    expect(text).toMatch(/fecha/);
    expect(text).toMatch(/abc/);
  });

  it("falls back gracefully when rowNumber or field is missing", () => {
    const text = formatIssue({ nOrden: 2, message: "Concepto vacío" });

    expect(text).toMatch(/Asiento 2/);
    expect(text).toMatch(/Concepto vacío/);
  });
});

describe("groupIssues — one group per problem type", () => {
  it("groups issues sharing field + message, counting affected rows", () => {
    const groups = groupIssues({
      errors: [
        { nOrden: 1, rowNumber: 5, field: "fecha", message: "Fecha inválida" },
        { nOrden: 2, rowNumber: 8, field: "fecha", message: "Fecha inválida" },
        { nOrden: 1, rowNumber: 6, field: "concepto", message: "Concepto vacío" },
      ],
      warnings: [],
    });

    expect(groups).toHaveLength(2);
    const fecha = groups.find((g) => g.field === "fecha");
    expect(fecha).toMatchObject({ severity: "error", field: "fecha", message: "Fecha inválida", count: 2 });
    expect(fecha.rows).toEqual([
      { rowNumber: 5, nOrden: 1 },
      { rowNumber: 8, nOrden: 2 },
    ]);
    expect(fecha.sample).toMatchObject({ rowNumber: 5, field: "fecha" });
  });

  it("normalizes 'Fila Excel N · Asiento X ·' prefixes into the same group", () => {
    const groups = groupIssues({
      errors: [
        { nOrden: 1, rowNumber: 5, field: "fecha", message: "Fecha inválida" },
        {
          nOrden: 2,
          rowNumber: 8,
          field: "fecha",
          message: "Fila Excel 8 · Asiento 2 · fecha: Fecha inválida",
        },
      ],
      warnings: [],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].message).toBe("Fecha inválida");
  });

  it("falls back to 'general' when field or message is missing", () => {
    const groups = groupIssues({
      errors: [{ nOrden: 2, rowNumber: 9, message: "Concepto vacío" }, {}],
      warnings: [],
    });

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.message === "Concepto vacío").field).toBe("general");
    const empty = groups.find((g) => g.message === "");
    expect(empty.field).toBe("general");
    expect(empty.rows).toEqual([{ rowNumber: null, nOrden: null }]);
  });

  it("orders errors first, then warnings; by count desc within severity", () => {
    const groups = groupIssues({
      errors: [
        { rowNumber: 1, nOrden: 1, field: "rare", message: "rare error" },
        { rowNumber: 2, nOrden: 2, field: "common", message: "common error" },
        { rowNumber: 3, nOrden: 3, field: "common", message: "common error" },
      ],
      warnings: [
        { rowNumber: 4, nOrden: 4, field: "noisy", message: "noisy warning" },
        { rowNumber: 5, nOrden: 5, field: "noisy", message: "noisy warning" },
        { rowNumber: 6, nOrden: 6, field: "noisy", message: "noisy warning" },
        { rowNumber: 7, nOrden: 7, field: "noisy", message: "noisy warning" },
      ],
    });

    expect(groups.map((g) => g.field)).toEqual(["common", "rare", "noisy"]);
    expect(groups.map((g) => g.severity)).toEqual(["error", "error", "warning"]);
  });
});

describe("formatGroupSummary — one sentence per group", () => {
  it("renders count, message and sampled rows/asientos", () => {
    const [group] = groupIssues({
      errors: [
        { nOrden: 1, rowNumber: 5, field: "fecha", message: "Fecha inválida" },
        { nOrden: 2, rowNumber: 8, field: "fecha", message: "Fecha inválida" },
        { nOrden: 2, rowNumber: 12, field: "fecha", message: "Fecha inválida" },
      ],
      warnings: [],
    });

    expect(formatGroupSummary(group)).toBe(
      "3 filas: Fecha inválida (ej: filas 5, 8, 12 · Asientos 1, 2)"
    );
  });

  it("limits the sample to the first 3 affected rows", () => {
    const [group] = groupIssues({
      errors: [5, 6, 7, 8, 9, 10].map((rowNumber, i) => ({
        nOrden: i + 1,
        rowNumber,
        field: "fecha",
        message: "Fecha inválida",
      })),
      warnings: [],
    });

    const summary = formatGroupSummary(group);
    expect(summary).toMatch(/^6 filas: /);
    expect(summary).toContain("5, 6, 7");
    expect(summary).not.toContain("10");
  });

  it("uses singular 'fila' for a single affected row", () => {
    const [group] = groupIssues({
      errors: [{ nOrden: 1, rowNumber: 5, field: "fecha", message: "Fecha inválida" }],
      warnings: [],
    });

    expect(formatGroupSummary(group)).toBe(
      "1 fila: Fecha inválida (ej: filas 5 · Asientos 1)"
    );
  });
});

describe("shouldEnableErrorsDownload — error-workbook button state", () => {
  const groups = [{ nOrden: 1, lines: [{ nOrden: 1, rowNumber: 2 }] }];

  it("enables when data exists and there is at least one error", () => {
    expect(
      shouldEnableErrorsDownload(groups, { errors: [{ message: "x" }], warnings: [] })
    ).toBe(true);
  });

  it("enables when data exists and there are only warnings", () => {
    expect(
      shouldEnableErrorsDownload(groups, { errors: [], warnings: [{ message: "y" }] })
    ).toBe(true);
  });

  it("disables when there are no issues at all", () => {
    expect(shouldEnableErrorsDownload(groups, { errors: [], warnings: [] })).toBe(false);
  });

  it("disables when there is no uploaded data, even with issues", () => {
    expect(shouldEnableErrorsDownload([], { errors: [{ message: "x" }], warnings: [] })).toBe(
      false
    );
  });

  it("accepts a flat issue array", () => {
    expect(shouldEnableErrorsDownload(groups, [{ message: "x" }])).toBe(true);
    expect(shouldEnableErrorsDownload(groups, [])).toBe(false);
  });
});
