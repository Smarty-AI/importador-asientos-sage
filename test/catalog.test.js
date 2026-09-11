import { describe, it, expect } from "vitest";
import { loadCatalog, lookupAccount } from "../docs/src/catalog.js";

const ENTRIES = [
  { cuenta: "11010001", codigoPlan: "ARG", codigoLlamada: "CAJ", div: "ARS" },
  { cuenta: "11010002", codigoPlan: "ARG", codigoLlamada: null, div: "USD" },
  { cuenta: "21010001", codigoPlan: "ARG", codigoLlamada: "PRV", div: "ARS" },
];

describe("lookupAccount", () => {
  it("finds an account and derives requiresTercero=true when Código llamada is populated", () => {
    const catalog = loadCatalog(ENTRIES);

    const result = lookupAccount(catalog, "11010001");

    expect(result).toEqual({
      exists: true,
      codigoPlan: "ARG",
      codigoLlamada: "CAJ",
      requiresTercero: true,
      div: "ARS",
    });
  });

  it("derives requiresTercero=false when Código llamada is null", () => {
    const catalog = loadCatalog(ENTRIES);

    const result = lookupAccount(catalog, "11010002");

    expect(result.requiresTercero).toBe(false);
    expect(result.div).toBe("USD");
  });

  it("returns exists=false for a code absent from the catalog", () => {
    const catalog = loadCatalog(ENTRIES);

    const result = lookupAccount(catalog, "99999999");

    expect(result).toEqual({ exists: false });
  });
});
