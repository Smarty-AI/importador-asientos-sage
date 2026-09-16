import { describe, it, expect } from "vitest";
import { validateBatch } from "../docs/src/validator.js";
import { loadCatalog } from "../docs/src/catalog.js";

const CATALOG = loadCatalog([
  { cuenta: "11010001", codigoPlan: "ARG", codigoLlamada: "CAJ", div: "ARS" }, // tercero-required
  { cuenta: "21010009", codigoPlan: "ARG", codigoLlamada: null, div: "ARS" }, // no tercero, known
]);

function group(nOrden, lines) {
  return { nOrden, lines: lines.map((line) => ({ nOrden, ...line })) };
}

function validLine(overrides = {}) {
  return {
    fecha: "2026-01-15",
    concepto: "Ajuste de prueba",
    codigoCuenta: "21010009",
    denominacionCuenta: "Cuenta de prueba",
    debe: 1000,
    haber: null,
    ...overrides,
  };
}

describe("validateBatch — blocking errors", () => {
  it("produces no errors for a fully valid line", () => {
    const groups = [group(1, [validLine()])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
  });

  it("errors when both Debe and Haber are populated", () => {
    const groups = [group(1, [validLine({ debe: 1000, haber: 500 })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ nOrden: 1 });
  });

  it("errors when neither Debe nor Haber are populated", () => {
    const groups = [group(1, [validLine({ debe: null, haber: null })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toHaveLength(1);
  });

  it("errors when N° Orden is blank", () => {
    const groups = [group("", [validLine({ nOrden: "" })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors.some((e) => e.field === "nOrden")).toBe(true);
  });

  it("errors when Fecha is invalid", () => {
    const groups = [group(1, [validLine({ fecha: "" })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors.some((e) => e.field === "fecha")).toBe(true);
  });

  it("errors when Concepto is empty", () => {
    const groups = [group(1, [validLine({ concepto: "" })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors.some((e) => e.field === "concepto")).toBe(true);
  });

  it("errors when Código Cuenta is empty", () => {
    const groups = [group(1, [validLine({ codigoCuenta: "" })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors.some((e) => e.field === "codigoCuenta")).toBe(true);
  });

  it("errors when Código Cuenta is non-numeric", () => {
    const groups = [group(1, [validLine({ codigoCuenta: "ABC123" })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors.some((e) => e.field === "codigoCuenta")).toBe(true);
  });

  it("errors when the populated Debe/Haber importe is non-numeric", () => {
    const groups = [group(1, [validLine({ debe: "not-a-number", haber: null })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors.some((e) => e.field === "debe" || e.field === "haber")).toBe(true);
  });
});

describe("validateBatch — non-blocking warnings", () => {
  it("warns (does not error) on an unknown account code", () => {
    const groups = [group(1, [validLine({ codigoCuenta: "99999999" })])];

    const { errors, warnings } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.field === "codigoCuenta")).toBe(true);
  });

  it("warns (does not error) on a tercero-required account", () => {
    const groups = [group(1, [validLine({ codigoCuenta: "11010001" })])];

    const { errors, warnings } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.message.toLowerCase().includes("tercero"))).toBe(true);
  });

  it("warns (does not error) on an unexpected account prefix and mentions the ARA analytic axis", () => {
    const groups = [group(1, [validLine({ codigoCuenta: "61010001" })])];

    const { errors, warnings } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
    const prefixWarning = warnings.find((w) => w.message.toLowerCase().includes("prefijo"));
    expect(prefixWarning).toBeDefined();
    expect(prefixWarning.message).toContain("emitirá ledgers ARA (2/5)");
  });

  it("does not warn on prefix 3 (patrimonio neto, e.g. 31010008) since it maps to ARG-only ledgers", () => {
    const groups = [group(1, [validLine({ codigoCuenta: "31010008" })])];

    const { errors, warnings } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.message.toLowerCase().includes("prefijo"))).toBe(false);
  });

  it("allows export (no errors) for a batch with only warnings", () => {
    const groups = [
      group(1, [validLine({ codigoCuenta: "99999999" })]),
      group(2, [validLine({ codigoCuenta: "11010001" })]),
    ];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
  });
});

describe("validateBatch — rowNumber propagation and actionable messages", () => {
  function groupWithRowNumber(nOrden, rowNumber, lineOverrides = {}) {
    return {
      nOrden,
      lines: [{ nOrden, rowNumber, ...validLine(lineOverrides) }],
    };
  }

  it("propagates Excel rowNumber into every issue", () => {
    const groups = [groupWithRowNumber(1, 5, { fecha: "abc" })];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].rowNumber).toBe(5);
  });

  it("enriches an invalid fecha with the received value and the expected form", () => {
    const groups = [groupWithRowNumber(1, 2, { fecha: "abc" })];

    const { errors } = validateBatch(groups, CATALOG);

    const fechaError = errors.find((e) => e.field === "fecha");
    expect(fechaError).toBeDefined();
    expect(fechaError.message).toMatch(/abc/);
    expect(fechaError.message).toMatch(/esperado/i);
    expect(fechaError.message).toMatch(/recibido/i);
  });

  it("enriches a non-numeric codigoCuenta with the received value and the expected form", () => {
    const groups = [groupWithRowNumber(1, 3, { codigoCuenta: "ABC123" })];

    const { errors } = validateBatch(groups, CATALOG);

    const codeError = errors.find((e) => e.field === "codigoCuenta");
    expect(codeError).toBeDefined();
    expect(codeError.message).toMatch(/ABC123/);
    expect(codeError.message).toMatch(/esperado/i);
  });

  it("enriches an empty concepto with the received value and the expected form", () => {
    const groups = [groupWithRowNumber(7, 9, { concepto: "" })];

    const { errors } = validateBatch(groups, CATALOG);

    const conceptoError = errors.find((e) => e.field === "concepto");
    expect(conceptoError).toBeDefined();
    expect(conceptoError.message).toMatch(/esperado/i);
    expect(conceptoError.message).toMatch(/recibido/i);
  });
});

describe("validateBatch — Debe/Haber zero handling", () => {
  it("accepts debe=100 when haber=0", () => {
    const groups = [group(1, [validLine({ debe: 100, haber: 0 })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
  });

  it("accepts haber=50 when debe=0", () => {
    const groups = [group(1, [validLine({ debe: 0, haber: 50 })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
  });

  it("errors once with 'Debe uno' when both sides are 0", () => {
    const groups = [group(1, [validLine({ debe: 0, haber: 0 })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Debe uno/);
  });

  it("errors once with 'Debe uno' when both sides are blank strings", () => {
    const groups = [group(1, [validLine({ debe: "", haber: "   " })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Debe uno/);
  });

  it("errors with 'ambos' when both sides hold non-zero importes", () => {
    const groups = [group(1, [validLine({ debe: 100, haber: 50 })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/ambos/);
  });

  it("accepts a spaced numeric string with a blank other side", () => {
    const groups = [group(1, [validLine({ debe: " 100 ", haber: "  " })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
  });

  it("treats zero-like strings as empty (debe=' 0 ' with haber=50 is valid)", () => {
    const groups = [group(1, [validLine({ debe: " 0 ", haber: 50 })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
  });

  it("errors non-numeric when the set side holds 'abc'", () => {
    const groups = [group(1, [validLine({ debe: "abc", haber: null })])];

    const { errors } = validateBatch(groups, CATALOG);

    expect(errors.some((e) => e.message.toLowerCase().includes("no numérico"))).toBe(true);
  });
});
