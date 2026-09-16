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

  it("warns (does not error) on an unexpected account prefix", () => {
    const groups = [group(1, [validLine({ codigoCuenta: "31010001" })])];

    const { errors, warnings } = validateBatch(groups, CATALOG);

    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.message.toLowerCase().includes("prefijo"))).toBe(true);
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
