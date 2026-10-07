import { describe, it, expect } from "vitest";
import { getLedgerMapping } from "../docs/src/ledger-rules.js";

describe("getLedgerMapping", () => {
  it("maps prefix 1 (patrimonial - activo) to ledgers 1,4,6 all COA=ARG", () => {
    const result = getLedgerMapping("11010001");

    expect(result).toEqual({
      ledgers: [1, 4, 6],
      coaByLedger: { 1: "ARG", 4: "ARG", 6: "ARG" },
      unexpectedPrefix: false,
    });
  });

  it("maps prefix 2 (patrimonial - pasivo) to ledgers 1,4,6 all COA=ARG", () => {
    const result = getLedgerMapping("21010001");

    expect(result).toEqual({
      ledgers: [1, 4, 6],
      coaByLedger: { 1: "ARG", 4: "ARG", 6: "ARG" },
      unexpectedPrefix: false,
    });
  });

  it("maps prefix 4 (resultado - gastos) to ledgers 1,4,6 all COA=ARG", () => {
    const result = getLedgerMapping("41010001");

    expect(result).toEqual({
      ledgers: [1, 4, 6],
      coaByLedger: { 1: "ARG", 4: "ARG", 6: "ARG" },
      unexpectedPrefix: false,
    });
  });

  it("maps prefix 5 (resultado - ingresos) to ledgers 1,4,6 all COA=ARG", () => {
    const result = getLedgerMapping("51010001");

    expect(result).toEqual({
      ledgers: [1, 4, 6],
      coaByLedger: { 1: "ARG", 4: "ARG", 6: "ARG" },
      unexpectedPrefix: false,
    });
  });

  it("never emits the ARA ledgers 2/5 for any prefix (no eje needed)", () => {
    for (const code of ["11010001", "21010001", "31010008", "41010001", "51010001", "888888883"]) {
      const result = getLedgerMapping(code);

      expect(result.ledgers).not.toContain(2);
      expect(result.ledgers).not.toContain(5);
      expect(Object.values(result.coaByLedger)).not.toContain("ARA");
    }
  });

  it("maps prefix 3 (patrimonio neto, e.g. 31010008) to ledgers 1,4,6 all COA=ARG without ARA", () => {
    const result = getLedgerMapping("31010008");

    expect(result).toEqual({
      ledgers: [1, 4, 6],
      coaByLedger: { 1: "ARG", 4: "ARG", 6: "ARG" },
      unexpectedPrefix: false,
    });
  });

  it("maps prefix 8 (orden) to ledgers 1,4,6 all COA=ARG", () => {
    const result = getLedgerMapping("888888883");

    expect(result).toEqual({
      ledgers: [1, 4, 6],
      coaByLedger: { 1: "ARG", 4: "ARG", 6: "ARG" },
      unexpectedPrefix: false,
    });
  });

  it("defaults unknown prefixes (0, 6, 7, 9) to the safe patrimonial mapping and flags them", () => {
    for (const code of ["01010001", "61010001", "71010001", "99999999"]) {
      expect(getLedgerMapping(code)).toEqual({
        ledgers: [1, 4, 6],
        coaByLedger: { 1: "ARG", 4: "ARG", 6: "ARG" },
        unexpectedPrefix: true,
      });
    }
  });
});
