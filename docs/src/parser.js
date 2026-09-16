/**
 * Pure(ish) XLSX-to-domain-object mapping. Receives the XLSX library as an
 * explicit dependency (dependency injection) instead of importing it or
 * reading a global — this keeps the module bundler-free, framework-free, and
 * trivially testable with any SheetJS-API-compatible library, whether that
 * is the npm `xlsx` package (tests) or the vendored `window.XLSX`
 * (`docs/vendor/xlsx.full.min.js`, wired by `ui.js`).
 *
 * @typedef {{
 *   nOrden: string|number,
 *   fecha: unknown,
 *   concepto: string,
 *   codigoCuenta: string,
 *   denominacionCuenta: string|null,
 *   debe: number|null,
 *   haber: number|null,
 * }} RawRow
 *
 * @typedef {{ nOrden: string|number, lines: RawRow[] }} OrdenGroup
 */

const HEADER_MAP = {
  "N° Orden": "nOrden",
  Fecha: "fecha",
  Concepto: "concepto",
  "Código Cuenta": "codigoCuenta",
  "Denominación de Cuenta": "denominacionCuenta",
  Debe: "debe",
  Haber: "haber",
};

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {typeof import("xlsx")} XLSXLib
 * @returns {RawRow[]}
 */
export function parseWorkbook(arrayBuffer, XLSXLib) {
  const workbook = XLSXLib.read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRecords = XLSXLib.utils.sheet_to_json(sheet, { defval: null });

  return rawRecords.map((record) => toRawRow(record));
}

function toRawRow(record) {
  /** @type {Partial<RawRow>} */
  const row = {};
  for (const [excelHeader, fieldName] of Object.entries(HEADER_MAP)) {
    row[fieldName] = Object.prototype.hasOwnProperty.call(record, excelHeader)
      ? record[excelHeader]
      : null;
  }
  return /** @type {RawRow} */ (row);
}

/**
 * @param {RawRow[]} rows
 * @returns {OrdenGroup[]}
 */
export function groupByOrden(rows) {
  /** @type {Map<string, OrdenGroup>} */
  const groupsByKey = new Map();
  /** @type {OrdenGroup[]} */
  const orderedGroups = [];

  for (const row of rows) {
    const key = String(row.nOrden);
    let group = groupsByKey.get(key);
    if (!group) {
      group = { nOrden: row.nOrden, lines: [] };
      groupsByKey.set(key, group);
      orderedGroups.push(group);
    }
    group.lines.push(row);
  }

  return orderedGroups;
}
