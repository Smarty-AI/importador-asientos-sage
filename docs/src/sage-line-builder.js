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
 * of 1 (single currency, no FX), the internal "N° Asiento" as the entry
 * REF, the row's own Concepto as the line DES, and a per-line sequential
 * LIN/IDTLIN (constant across that line's ledger repeats). This is a
 * disclosed assumption, not a silently invented rule — flag for user
 * confirmation against a real SAGE test import.
 */

import { getLedgerMapping } from "./ledger-rules.js";

const FIXED_RATMLT = "1";

/**
 * @param {import("./parser.js").AsientoGroup[]} groups
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

function buildHeaderLine(group, batchConfig) {
  const firstLine = group.lines[0];
  const fields = [
    batchConfig.TYP,
    "", // NUM — always blank, SAGE assigns it on import
    batchConfig.FCY,
    batchConfig.JOU,
    toAAAAMMDD(firstLine.fecha),
    "", // DUDDAT — no due date for GL adjustment entries
    firstLine.concepto ?? "",
    "", // BPRVCR — no source voucher
    "", // BPRDATVCR — no source voucher date
    String(group.nAsiento),
    batchConfig.CUR,
    batchConfig.DACDIA,
    FIXED_RATMLT,
  ];
  return "A;" + fields.join(";");
}

function buildDetailLines(group, batchConfig) {
  const detailLines = [];

  group.lines.forEach((line, index) => {
    const lin = index + 1;
    const idtlin = lin;
    const mapping = getLedgerMapping(line.codigoCuenta);
    const { sns, amtcur } = deriveSnsAndAmount(line);

    for (const ledger of mapping.ledgers) {
      const fields = [
        lin,
        ledger,
        idtlin,
        batchConfig.FCY,
        mapping.coaByLedger[ledger],
        "", // SAC — always blank
        line.codigoCuenta,
        "", // BPR — always blank
        line.concepto ?? "",
        sns,
        amtcur,
        batchConfig.CUR,
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
