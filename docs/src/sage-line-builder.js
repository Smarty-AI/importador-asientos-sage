/**
 * Pure ZXARGGAS (SAGE X3 Import/Export MIG - Asientos contables) text-file
 * assembly. One `A` header line per entry (asiento), followed by one `B`
 * detail line per ledger per source row (per design-decisions #1297 and
 * the SAGE field guide `Guia_Interpretacion_Input_Output_SAGE_ZXARGGAS.docx`).
 *
 * Confirmed-by-business fields: `NUM` is always blank (SAGE assigns it on
 * import); `SAC`/`BPR` are always blank (deliberate no-tercero test);
 * ledgers/COA come from `ledger-rules.js`; `SNS`/`AMTCUR` derive from
 * Debe/Haber.
 *
 * Fields the confirmed business rules do not explicitly define
 * (`DUDDAT`, `BPRVCR`, `BPRDATVCR`, `RATMLT`, `REF`, `DES`, `LIN`, `IDTLIN`,
 * `FCYLIN`) are filled with the most literal reading of the SAGE field guide
 * for a GL-to-GL adjustment entry with no source voucher/tercero: no due
 * date, no source-voucher reference/date, a fixed exchange-rate multiplier
 * of 1 (single currency, no FX), the internal "N° Orden" as the entry
 * REF, the row's own Concepto as the line DES, and a per-line sequential
 * LIN/IDTLIN (constant across that line's ledger repeats). This is a
 * disclosed assumption, not a silently invented rule — flag for user
 * confirmation against a real SAGE test import.
 */

import { getLedgerMapping } from "./ledger-rules.js";

const FIXED_RATMLT = "1";

/**
 * @param {import("./parser.js").OrdenGroup[]} groups
 * @param {{ TYP: string, FCY: string, JOU: string, DACDIA: string, CUR: string }} batchConfig
 * @param {import("./catalog.js").Catalog} _catalog unused for output — SAC/BPR are always
 *   blank by deliberate business decision; kept for interface parity with design.md
 * @returns {string}
 */
export function buildZxarggasFile(groups, batchConfig, _catalog) {
  const lines = [];

  for (const group of groups) {
    lines.push(buildHeaderLine(group, batchConfig));
    lines.push(...buildDetailLines(group, batchConfig));
  }

  return lines.join("\r\n") + "\r\n";
}

// "A" header line — 13 fields, per the ZXARGGAS field grid (Modelos import./export.,
// table GACCENTRY) confirmed against the vendor mail and design-decisions #1297.
// Each entry below is: [value] — FIELD_CODE ("field grid label"): what it holds here.
function buildHeaderLine(group, batchConfig) {
  const firstLine = group.lines[0];
  const fields = [
    batchConfig.TYP, // TYP ("Tipo asiento"): entry type, batch-fixed to "AJU"
    "", // NUM ("Número de asiento"): always blank — SAGE's own counter assigns it on import
    batchConfig.FCY, // FCY ("Planta"): site/plant, batch-fixed to "CEN"
    batchConfig.JOU, // JOU ("Diario"): journal, batch-fixed to "ODG"
    toAAAAMMDD(firstLine.fecha), // ACCDAT ("Fecha contable"): posting date, AAAAMMDD
    "", // DUDDAT ("Fecha vencimiento"): due date — none for a GL adjustment entry
    firstLine.concepto ?? "", // DESVCR ("Descripción"): entry description, from the row's Concepto
    "", // BPRVCR ("Documento origen"): source voucher — none, no upstream document
    "", // BPRDATVCR ("Fecha documento"): source voucher date — none, no upstream document
    String(group.nOrden), // REF ("Referencia"): N° Orden (agrupador interno, va a REF), used only to group rows
    batchConfig.CUR, // CUR ("Divisa de asiento"): entry currency, batch-fixed to "ARS"
    batchConfig.DACDIA, // DACDIA ("Transacción"): posting transaction, batch-fixed to "STDCO"
    FIXED_RATMLT, // RATMLT ("Cambio multiplicador"): FX multiplier — fixed "1", single-currency entries only
  ];
  return "A;" + fields.join(";");
}

// "B" detail line — 12 fields, per the ZXARGGAS field grid (table GACCENTRYD).
// One "B" line is emitted per ledger returned by ledger-rules.js for that
// account (the same accounting line repeated once per ledger it posts to —
// see design-decisions #1297 on why cuentas patrimoniales only need
// ledgers 1,4,6 while cuentas de resultado also need 2,5 with COA=ARA).
function buildDetailLines(group, batchConfig) {
  const detailLines = [];

  group.lines.forEach((line, index) => {
    const lin = index + 1; // LIN ("Número de línea"): this row's position within the entry
    const idtlin = lin; // IDTLIN ("Identificador"): ties this line's ledger repeats together — same value as LIN
    const mapping = getLedgerMapping(line.codigoCuenta);
    const { sns, amtcur } = deriveSnsAndAmount(line);

    for (const ledger of mapping.ledgers) {
      const fields = [
        lin,
        ledger, // LEDTYP ("Tipo de referencia"): ledger code this repeat posts to (1/2/4/5/6)
        idtlin,
        batchConfig.FCY, // FCYLIN ("Planta"): site/plant, same as the header FCY
        mapping.coaByLedger[ledger], // COA ("Código plan"): chart of accounts for this ledger — ARG or ARA
        "", // SAC ("Cta. ctrl."): control-account/tercero code — always blank (no-tercero test)
        line.codigoCuenta, // ACC ("Cuentas generales"): the actual account code being posted
        "", // BPR ("Tercero"): business-partner code — always blank (no-tercero test)
        line.concepto ?? "", // DES ("Descripción"): line description, from the row's Concepto
        sns, // SNS ("Signo"): +1 debe / -1 haber
        amtcur, // AMTCUR ("Importe asiento"): absolute amount for this line
        batchConfig.CUR, // CUR ("Divisa de asiento"): line currency, batch-fixed to "ARS"
      ];
      detailLines.push("B;" + fields.join(";"));
    }
  });

  return detailLines;
}

function deriveSnsAndAmount(line) {
  const debeSet = line.debe !== null && line.debe !== undefined && line.debe !== "";
  if (debeSet) {
    return { sns: 1, amtcur: Math.abs(Number(line.debe)) };
  }
  return { sns: -1, amtcur: Math.abs(Number(line.haber)) };
}

function toAAAAMMDD(fecha) {
  let date;
  if (fecha instanceof Date) {
    date = fecha;
  } else if (typeof fecha === "number") {
    // Excel serial date: days since 1899-12-30
    const epochMs = Date.UTC(1899, 11, 30);
    date = new Date(epochMs + fecha * 86400000);
  } else {
    date = new Date(String(fecha));
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
