/**
 * Pure ZXARGGAS (SAGE X3 Import/Export MIG - Asientos contables) text-file
 * assembly. One `A` header line per entry (asiento), followed by one `B`
 * detail line per ledger per source row (per design-decisions #1297).
 *
 * FIELD GRID SOURCE OF TRUTH: the model as installed, observed through
 * SAGE's own parser traces (DIMPOBJ2 "Importación de datos" and the LECFIC
 * "Lectura fichero secuencial" log), plus one full year of real SAGE data.
 * The .docx guide `Guia_Interpretacion_Input_Output_SAGE_ZXARGGAS.docx`
 * documents an OLDER model revision and is wrong on three counts — it has a
 * COA field in the "B" line, it swaps BPRDATVCR/DUDDAT in the "A" line, and
 * it claims dates are AAAAMMDD. Every one of those mistakes shifted fields
 * and broke a full import; do not "fix" the code back towards the guide.
 *
 * Confirmed-by-business fields: `NUM` is always blank (SAGE assigns it on
 * import); `SAC`/`BPR` are always blank (deliberate no-tercero test);
 * ledgers come from `ledger-rules.js`; `SNS`/`AMTCUR` derive from Debe/Haber.
 *
 * Fields the confirmed business rules do not explicitly define
 * (`DUDDAT`, `BPRVCR`, `BPRDATVCR`, `RATMLT`, `REF`, `DES`, `LIN`, `IDTLIN`,
 * `FCYLIN`) are filled with the most literal reading for a GL-to-GL
 * adjustment entry with no source voucher/tercero: no due date, no
 * source-voucher reference/date, a fixed exchange-rate multiplier of 1
 * (single currency, no FX), the internal "N° Orden" as the entry REF, the
 * row's own Concepto as the line DES, and a per-line sequential LIN/IDTLIN
 * (constant across that line's ledger repeats).
 *
 * "C" analytic-axis line: NOT EMITTED. Emitting one makes every entry that
 * touches an ARA ledger fail with error 25 ("Distribución descuadrada"), and
 * omitting it makes the same entries fail with error 97 ("Hay que indicar al
 * menos un eje") — the installed model accepts neither, because the eje grid
 * (GACCENTRYA: ANALIN, DIE, CCE) has no field for the distribution amount.
 * The way out is `ledger-rules.js`: only ledgers 1/4/6 are emitted, so no
 * line ever needs an axis. See that module for the measured evidence.
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

// "A" header line — 13 fields, in the exact order of the model's GACCENTRY
// grid. Field order was confirmed against SAGE's own parser trace
// (DIMPOBJ2 "Importación de datos" trace), NOT the .docx field guide: the
// guide documents an older model revision where BPRDATVCR and DUDDAT sit in
// the opposite positions, which silently pushed our description into the
// DUDDAT slot and made SAGE report "Fecha incorrecta DUDDAT".
// Each entry below is: [value] — FIELD_CODE ("field grid label"): what it holds here.
function buildHeaderLine(group, batchConfig) {
  const firstLine = group.lines[0];
  const fields = [
    batchConfig.TYP, // TYP ("Tipo asiento"): entry type, batch-fixed to "AJU"
    "", // NUM ("Número de asiento"): always blank — SAGE's own counter assigns it on import
    batchConfig.FCY, // FCY ("Planta"): site/plant, batch-fixed to "CEN"
    batchConfig.JOU, // JOU ("Diario"): journal, batch-fixed to "ODG"
    toDDMMYYYY(firstLine.fecha), // ACCDAT ("Fecha contable"): posting date, DDMMYYYY
    "", // BPRDATVCR ("Fecha documento"): source voucher date — none, no upstream document
    "", // DUDDAT ("Fecha vencimiento"): due date — none for a GL adjustment entry
    firstLine.concepto ?? "", // DESVCR ("Descripción"): entry description, from the row's Concepto
    "", // BPRVCR ("Documento origen"): source voucher — none, no upstream document
    String(group.nOrden), // REF ("Referencia"): N° Orden (agrupador interno, va a REF), used only to group rows
    batchConfig.CUR, // CUR ("Divisa de asiento"): entry currency, batch-fixed to "ARS"
    batchConfig.DACDIA, // DACDIA ("Transacción"): posting transaction, batch-fixed to "STDCO"
    FIXED_RATMLT, // RATMLT ("Cambio multiplicador"): FX multiplier — fixed "1", single-currency entries only
  ];
  return "A;" + fields.join(";");
}

// "B" detail line — 11 fields, in the exact order of the model's GACCENTRYD
// grid: LIN, LEDTYP, IDTLIN, FCYLIN, SAC, ACC, BPR, DES, SNS, AMTCUR, CUR.
//
// There is NO COA field in this model. COA exists as a column of the
// GACCENTRYD table (ARG/ARA) and shows up in SAGE's record browser, but the
// import grid does not expose it: SAGE derives the plan from LEDTYP. Emitting
// it shifted every following field one position to the left, so SAGE read the
// plan as SAC and failed all 76 lines with error 99 "La cuenta de control no
// existe". Confirmed against the DIMPOBJ2 parser trace and against a full
// year of real SAGE data, whose lines carry exactly these 11 fields.
//
// One "B" line is emitted per ledger returned by ledger-rules.js for that
// account (the same accounting line repeated once per ledger it posts to —
// see design-decisions #1297 on the ledger expansion).
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
        "", // SAC ("Cta. ctrl."): control-account code — always blank (no-tercero test)
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
  const debeSet = !isBlankOrZero(line.debe);
  if (debeSet) {
    return { sns: 1, amtcur: Math.abs(Number(line.debe)) };
  }
  return { sns: -1, amtcur: Math.abs(Number(line.haber)) };
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

/**
 * Business rule: numeric zero ("0", "0.00", 0, " 0 ") means EMPTY.
 * Non-numeric values ("abc") are NOT zero — they count as set so the
 * validator reports them as "no numérico".
 */
function isBlankOrZero(value) {
  if (isBlank(value)) return true;
  const num = Number(String(value).trim());
  if (Number.isNaN(num)) return false;
  return num === 0;
}

/**
 * Posting date in DDMMYYYY. SAGE's parser rejects YYYYMMDD with "Fecha
 * incorrecta ACCDAT" (77 anomalies on the last run) and renders a correctly
 * parsed value as DD/MM/YY, so the model's date mask is DDMMYYYY. The .docx
 * guide claims AAAAMMDD — that is wrong for this model revision.
 * @param {unknown} fecha
 * @returns {string}
 */
function toDDMMYYYY(fecha) {
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
  return `${day}${month}${year}`;
}
