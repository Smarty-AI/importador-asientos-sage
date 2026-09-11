import { describe, it, expect } from "vitest";
import { transformRows } from "../scripts/catalog-transform.mjs";

// Fixture mimicking a raw XLSX sheet read via `header: 1`:
// row 0 = header, followed by data rows, with blank padding rows
// (all-null arrays) interspersed, exactly like the real
// "Plan de cuentas EU.xlsx" sheet.
const HEADER = ["Cuenta", "Descripción", "Código plan", "Código llamada", "Div."];
const BLANK_ROW = [null, null, null, null, null];

describe("transformRows", () => {
  it("maps valid rows into CatalogEntry objects without the descripcion column", () => {
    const rawRows = [
      HEADER,
      [11010001, "Caja Tesoreria", "ARG", "CAJ", "ARS"],
      [21010001, "Proveedores", "ARG", "PRV", "ARS"],
    ];

    const result = transformRows(rawRows);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      cuenta: "11010001",
      codigoPlan: "ARG",
      codigoLlamada: "CAJ",
      div: "ARS",
    });
    expect(result[1]).toEqual({
      cuenta: "21010001",
      codigoPlan: "ARG",
      codigoLlamada: "PRV",
      div: "ARS",
    });
    for (const entry of result) {
      expect(entry).not.toHaveProperty("descripcion");
      expect(entry).not.toHaveProperty("Descripción");
    }
  });

  it("drops blank padding rows interspersed with real data", () => {
    const rawRows = [
      HEADER,
      [11010002, "Caja ME", "ARG", null, "USD"],
      BLANK_ROW,
      BLANK_ROW,
      [11010003, "Valores a depositar", "ARG", "VAD", "ARS"],
      BLANK_ROW,
    ];

    const result = transformRows(rawRows);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.cuenta)).toEqual(["11010002", "11010003"]);
  });

  it("normalizes a missing Código llamada to null (no tercero code)", () => {
    const rawRows = [HEADER, [11010004, "Banco Nacion", "ARG", null, "ARS"]];

    const result = transformRows(rawRows);

    expect(result[0].codigoLlamada).toBeNull();
  });
});
