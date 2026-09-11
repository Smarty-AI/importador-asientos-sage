import { describe, it, expect } from "vitest";
import XLSX from "xlsx";
import { buildTemplateWorkbook } from "../docs/src/template-builder.js";

// `template-builder.js` never imports an XLSX library itself (no bundler, no
// global assumptions) — it receives the library as an explicit dependency,
// matching the pattern used by `parser.js`. Tests pass the npm `xlsx`
// package; the browser uses the vendored `window.XLSX` at runtime.

const EXPECTED_HEADER = [
  "N° Asiento",
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
