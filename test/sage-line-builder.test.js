import { describe, it, expect } from "vitest";
import { buildZxarggasFile } from "../docs/src/sage-line-builder.js";

const BATCH_CONFIG = { TYP: "AJU", FCY: "CEN", JOU: "ODG", DACDIA: "STDCO", CUR: "ARS" };

describe("buildZxarggasFile", () => {
  it("builds one A header line and repeated B lines per ledger, CRLF-joined", () => {
    const groups = [
      {
        nOrden: 1,
        lines: [
          {
            nOrden: 1,
            fecha: "2026-01-15",
            concepto: "Ajuste de caja",
            codigoCuenta: "11010001",
            debe: 1000,
            haber: null,
          },
          {
            nOrden: 1,
            fecha: "2026-01-15",
            concepto: "Ajuste de caja",
            codigoCuenta: "21010001",
            debe: null,
            haber: 1000,
          },
        ],
      },
    ];

    const output = buildZxarggasFile(groups, BATCH_CONFIG, new Map());

    const expectedLines = [
      "A;AJU;;CEN;ODG;20260115;;Ajuste de caja;;;1;ARS;STDCO;1",
      "B;1;1;1;CEN;ARG;;11010001;;Ajuste de caja;1;1000;ARS",
      "B;1;4;1;CEN;ARG;;11010001;;Ajuste de caja;1;1000;ARS",
      "B;1;6;1;CEN;ARG;;11010001;;Ajuste de caja;1;1000;ARS",
      "B;2;1;2;CEN;ARG;;21010001;;Ajuste de caja;-1;1000;ARS",
      "B;2;4;2;CEN;ARG;;21010001;;Ajuste de caja;-1;1000;ARS",
      "B;2;6;2;CEN;ARG;;21010001;;Ajuste de caja;-1;1000;ARS",
    ];

    expect(output).toBe(expectedLines.join("\r\n") + "\r\n");
  });

  it("NUM is always blank and SAC/BPR are always blank regardless of account", () => {
    const groups = [
      {
        nOrden: 7,
        lines: [
          {
            nOrden: 7,
            fecha: "2026-02-01",
            concepto: "Cierre",
            codigoCuenta: "11010001", // one of the 9 tercero-required accounts
            debe: 500,
            haber: null,
          },
        ],
      },
    ];

    const output = buildZxarggasFile(groups, BATCH_CONFIG, new Map());
    const aLine = output.split("\r\n")[0];
    const aFields = aLine.split(";");

    expect(aFields[0]).toBe("A");
    expect(aFields[2]).toBe(""); // NUM always blank

    const bLine = output.split("\r\n")[1];
    const bFields = bLine.split(";");
    expect(bFields[6]).toBe(""); // SAC always blank
    expect(bFields[8]).toBe(""); // BPR always blank
  });

  it("expands a 4/5-prefix account into 5 ledgers with the ARG/ARA split", () => {
    const groups = [
      {
        nOrden: 2,
        lines: [
          {
            nOrden: 2,
            fecha: "2026-01-20",
            concepto: "Gasto de ajuste",
            codigoCuenta: "41010001",
            debe: 250,
            haber: null,
          },
        ],
      },
    ];

    const output = buildZxarggasFile(groups, BATCH_CONFIG, new Map());
    const bLines = output.split("\r\n").filter((l) => l.startsWith("B"));

    expect(bLines).toHaveLength(5);
    const coaByLedger = Object.fromEntries(
      bLines.map((line) => {
        const fields = line.split(";");
        return [fields[2], fields[5]]; // LEDTYP -> COA
      })
    );
    expect(coaByLedger).toEqual({ 1: "ARG", 2: "ARA", 4: "ARG", 5: "ARA", 6: "ARG" });
  });
});
