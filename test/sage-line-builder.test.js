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

describe("buildZxarggasFile — eje analítico (línea C)", () => {
  function ingresoGroups(codigoCuenta) {
    return [
      {
        nOrden: 1,
        lines: [
          {
            nOrden: 1,
            fecha: "2026-03-10",
            concepto: "Venta del mes",
            codigoCuenta,
            debe: null,
            haber: 500,
          },
        ],
      },
    ];
  }

  it("emits exactly one C;1;CCO line after each ARA-ledger B line (2 and 5)", () => {
    const output = buildZxarggasFile(ingresoGroups("41010001"), BATCH_CONFIG, new Map());
    const lines = output.split("\r\n").filter((l) => l !== "");

    expect(lines).toEqual([
      "A;AJU;;CEN;ODG;20260310;;Venta del mes;;;1;ARS;STDCO;1",
      "B;1;1;1;CEN;ARG;;41010001;;Venta del mes;-1;500;ARS",
      "B;1;2;1;CEN;ARA;;41010001;;Venta del mes;-1;500;ARS",
      "C;1;CCO;VEN",
      "B;1;4;1;CEN;ARG;;41010001;;Venta del mes;-1;500;ARS",
      "B;1;5;1;CEN;ARA;;41010001;;Venta del mes;-1;500;ARS",
      "C;1;CCO;VEN",
      "B;1;6;1;CEN;ARG;;41010001;;Venta del mes;-1;500;ARS",
    ]);
  });

  it("uses VEN for prefix 4 (ingresos) and ADM for prefix 5 (gastos)", () => {
    const ingreso = buildZxarggasFile(ingresoGroups("41010001"), BATCH_CONFIG, new Map());
    const gasto = buildZxarggasFile(ingresoGroups("51050001"), BATCH_CONFIG, new Map());

    expect(ingreso.split("\r\n").filter((l) => l.startsWith("C;"))).toEqual([
      "C;1;CCO;VEN",
      "C;1;CCO;VEN",
    ]);
    expect(gasto.split("\r\n").filter((l) => l.startsWith("C;"))).toEqual([
      "C;1;CCO;ADM",
      "C;1;CCO;ADM",
    ]);
  });

  it("emits no C line for patrimonial accounts (ledgers 1/4/6 only, no ARA)", () => {
    const groups = [
      {
        nOrden: 1,
        lines: [
          {
            nOrden: 1,
            fecha: "2026-03-10",
            concepto: "Ajuste de caja",
            codigoCuenta: "11010001",
            debe: 100,
            haber: null,
          },
        ],
      },
    ];

    const output = buildZxarggasFile(groups, BATCH_CONFIG, new Map());

    expect(output.split("\r\n").filter((l) => l.startsWith("C;"))).toEqual([]);
  });

  it("numbers the eje counter per accounting line, not per ledger repeat", () => {
    const groups = [
      {
        nOrden: 5,
        lines: [
          {
            nOrden: 5,
            fecha: "2026-03-10",
            concepto: "Gasto",
            codigoCuenta: "51050001",
            debe: 100,
            haber: null,
          },
          {
            nOrden: 5,
            fecha: "2026-03-10",
            concepto: "Ingreso",
            codigoCuenta: "41010001",
            debe: null,
            haber: 100,
          },
        ],
      },
    ];

    const output = buildZxarggasFile(groups, BATCH_CONFIG, new Map());
    const cLines = output.split("\r\n").filter((l) => l.startsWith("C;"));

    // One eje per ARA repeat of each line; both lines keep eje number 1.
    expect(cLines).toEqual(["C;1;CCO;ADM", "C;1;CCO;ADM", "C;1;CCO;VEN", "C;1;CCO;VEN"]);
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
    return { sns: fields[10], amtcur: fields[11] };
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
