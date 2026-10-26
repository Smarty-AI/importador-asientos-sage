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

  it("maps prefix 4 (resultado) to ledgers 1,2,4,5,6 with the ARG/ARA split", () => {
    const result = getLedgerMapping("41010001");

    expect(result).toEqual({
      ledgers: [1, 2, 4, 5, 6],
      coaByLedger: { 1: "ARG", 2: "ARA", 4: "ARG", 5: "ARA", 6: "ARG" },
      unexpectedPrefix: false,
    });
  });

  it("maps prefix 5 (resultado) to ledgers 1,2,4,5,6 with the ARG/ARA split", () => {
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

  it("never emits the ARA ledgers for patrimonial or unknown prefixes", () => {
    for (const code of ["11010001", "21010001", "31010008", "888888883", "01010001", "61010001", "71010001", "99999999"]) {
      const result = getLedgerMapping(code);

      expect(result.ledgers).toEqual([1, 4, 6]);
      expect(Object.values(result.coaByLedger)).not.toContain("ARA");
    }
  });

  it("flags unknown prefixes (0, 6, 7, 9) and maps them to the safe patrimonial set", () => {
    for (const code of ["01010001", "61010001", "71010001", "99999999"]) {
      const result = getLedgerMapping(code);

      expect(result).toEqual({
        ledgers: [1, 4, 6],
        coaByLedger: { 1: "ARG", 4: "ARG", 6: "ARG" },
        unexpectedPrefix: true,
      });
    }
  });
});