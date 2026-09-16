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

  it("maps prefix 4 (resultado - gastos) to ledgers 1,2,4,5,6 with ARG/ARA split", () => {
    const result = getLedgerMapping("41010001");

    expect(result).toEqual({
      ledgers: [1, 2, 4, 5, 6],
      coaByLedger: { 1: "ARG", 2: "ARA", 4: "ARG", 5: "ARA", 6: "ARG" },
      unexpectedPrefix: false,
    });
  });

  it("maps prefix 5 (resultado - ingresos) to ledgers 1,2,4,5,6 with ARG/ARA split", () => {
    const result = getLedgerMapping("51010001");

    expect(result).toEqual({
      ledgers: [1, 2, 4, 5, 6],
      coaByLedger: { 1: "ARG", 2: "ARA", 4: "ARG", 5: "ARA", 6: "ARG" },
      unexpectedPrefix: false,
    });
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
