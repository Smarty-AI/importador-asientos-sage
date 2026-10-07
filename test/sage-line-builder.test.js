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
      "A;AJU;;CEN;ODG;15012026;;;Ajuste de caja;;1;ARS;STDCO;1",
      "B;1;1;1;CEN;;11010001;;Ajuste de caja;1;1000;ARS",
      "B;1;4;1;CEN;;11010001;;Ajuste de caja;1;1000;ARS",
      "B;1;6;1;CEN;;11010001;;Ajuste de caja;1;1000;ARS",
      "B;2;1;2;CEN;;21010001;;Ajuste de caja;-1;1000;ARS",
      "B;2;4;2;CEN;;21010001;;Ajuste de caja;-1;1000;ARS",
      "B;2;6;2;CEN;;21010001;;Ajuste de caja;-1;1000;ARS",
    ];

    expect(output).toBe(expectedLines.join("\r\n") + "\r\n");
  });

  it("writes the A line in the model's field order, with dates as DDMMYYYY", () => {
    // Regression guard: the guide's order (DUDDAT before BPRDATVCR) pushed the
    // description into the DUDDAT slot and SAGE reported "Fecha incorrecta
    // DUDDAT". Model order is ACCDAT, BPRDATVCR, DUDDAT, DESVCR.
    const groups = [
      {
        nOrden: 42,
        lines: [
          {
            nOrden: 42,
            fecha: new Date(Date.UTC(2025, 3, 1)),
            concepto: "Ajuste apertura IIBB",
            codigoCuenta: "11040070",
            debe: 58925.89,
            haber: null,
          },
        ],
      },
    ];

    const [aLine] = buildZxarggasFile(groups, BATCH_CONFIG, new Map()).split("\r\n");
    const fields = aLine.split(";");

    expect(fields).toEqual([
      "A",
      "AJU", // TYP
      "", // NUM
      "CEN", // FCY
      "ODG", // JOU
      "01042025", // ACCDAT, DDMMYYYY
      "", // BPRDATVCR
      "", // DUDDAT
      "Ajuste apertura IIBB", // DESVCR
      "", // BPRVCR
      "42", // REF
      "ARS", // CUR
      "STDCO", // DACDIA
      "1", // RATMLT
    ]);
  });

  it("writes the B line with the model's 11 fields and no COA", () => {
    // Regression guard: emitting COA shifted every field left, so SAGE read the
    // plan as SAC and rejected all 76 lines with error 99 "La cuenta de
    // control no existe".
    const groups = [
      {
        nOrden: 1,
        lines: [
          {
            nOrden: 1,
            fecha: "2025-04-01",
            concepto: "Ajuste apertura IIBB",
            codigoCuenta: "11040070",
            debe: 58925.89,
            haber: null,
          },
        ],
      },
    ];

    const bLine = buildZxarggasFile(groups, BATCH_CONFIG, new Map())
      .split("\r\n")
      .find((l) => l.startsWith("B;"));

    expect(bLine.split(";")).toEqual([
      "B",
      "1", // LIN
      "1", // LEDTYP
      "1", // IDTLIN
      "CEN", // FCYLIN
      "", // SAC
      "11040070", // ACC
      "", // BPR
      "Ajuste apertura IIBB", // DES
      "1", // SNS
      "58925.89", // AMTCUR
      "ARS", // CUR
    ]);
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
    expect(bFields[5]).toBe(""); // SAC always blank
    expect(bFields[7]).toBe(""); // BPR always blank
  });

  it("expands every account — including 4/5 prefix — into ledgers 1,4,6 and no eje line", () => {
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
    const lines = output.split("\r\n").filter((l) => l !== "");

    expect(lines).toEqual([
      "A;AJU;;CEN;ODG;20012026;;;Gasto de ajuste;;2;ARS;STDCO;1",
      "B;1;1;1;CEN;;41010001;;Gasto de ajuste;1;250;ARS",
      "B;1;4;1;CEN;;41010001;;Gasto de ajuste;1;250;ARS",
      "B;1;6;1;CEN;;41010001;;Gasto de ajuste;1;250;ARS",
    ]);
    // No analytic-axis line: ledgers 2/5 (ARA) are never emitted, so nothing
    // needs an eje and the model stops answering "Distribución descuadrada".
    expect(lines.filter((l) => l.startsWith("C;"))).toEqual([]);
  });
});

describe("buildZxarggasFile — Debe/Haber zero means empty", () => {
  function singleLineGroups(debe, haber) {
    return [
      {
        nOrden: 1,
        lines: [
          {
            nOrden: 1,
            fecha: "2026-01-15",
            concepto: "Ajuste",
            codigoCuenta: "21010001",
            debe,
            haber,
          },
        ],
      },
    ];
  }

  function firstBSnsAmtcur(output) {
    const bLine = output.split("\r\n").find((l) => l.startsWith("B"));
    const fields = bLine.split(";");
    return { sns: fields[9], amtcur: fields[10] };
  }

  it("treats debe=0 with haber=100 as a haber line (SNS=-1, amtcur=100)", () => {
    const output = buildZxarggasFile(singleLineGroups(0, 100), BATCH_CONFIG, new Map());

    expect(firstBSnsAmtcur(output)).toEqual({ sns: "-1", amtcur: "100" });
  });

  it("treats debe='0' with haber=100 as a haber line", () => {
    const output = buildZxarggasFile(singleLineGroups("0", 100), BATCH_CONFIG, new Map());

    expect(firstBSnsAmtcur(output)).toEqual({ sns: "-1", amtcur: "100" });
  });

  it("treats debe=100 with haber=0 as a debe line (SNS=1, amtcur=100)", () => {
    const output = buildZxarggasFile(singleLineGroups(100, 0), BATCH_CONFIG, new Map());

    expect(firstBSnsAmtcur(output)).toEqual({ sns: "1", amtcur: "100" });
  });
});