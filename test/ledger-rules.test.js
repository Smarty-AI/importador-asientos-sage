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

  it("applies the 4/5 mapping to an unexpected prefix (e.g. 3, 8) and flags it", () => {
    const resultPrefix3 = getLedgerMapping("31010001");
    const resultPrefix8 = getLedgerMapping("888888883");

    expect(resultPrefix3).toEqual({
      ledgers: [1, 2, 4, 5, 6],
      coaByLedger: { 1: "ARG", 2: "ARA", 4: "ARG", 5: "ARA", 6: "ARG" },
      unexpectedPrefix: true,
    });
    expect(resultPrefix8).toEqual({
      ledgers: [1, 2, 4, 5, 6],
      coaByLedger: { 1: "ARG", 2: "ARA", 4: "ARG", 5: "ARA", 6: "ARG" },
      unexpectedPrefix: true,
    });
  });
});
