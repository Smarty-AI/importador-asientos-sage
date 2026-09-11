/**
 * Pure transform: raw XLSX rows (array-of-arrays, first row = header) ->
 * a privacy-scrubbed CatalogEntry[] for `docs/data/chart-of-accounts.json`.
 *
 * Never includes the `Descripción` column (real account names are sensitive
 * business data — this repo/site is public). Drops fully-blank padding rows
 * that appear at the end (or interspersed) in the source sheet.
 *
 * @typedef {{ cuenta: string, codigoPlan: string, codigoLlamada: string|null, div: string|null }} CatalogEntry
 */

const COLUMN_NAMES = {
  cuenta: "Cuenta",
  codigoPlan: "Código plan",
  codigoLlamada: "Código llamada",
  div: "Div.",
};

/**
 * @param {unknown[][]} rawRows
 * @returns {CatalogEntry[]}
 */
export function transformRows(rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return [];
  }

  const [header, ...dataRows] = rawRows;
  const columnIndex = {
    cuenta: header.indexOf(COLUMN_NAMES.cuenta),
    codigoPlan: header.indexOf(COLUMN_NAMES.codigoPlan),
    codigoLlamada: header.indexOf(COLUMN_NAMES.codigoLlamada),
    div: header.indexOf(COLUMN_NAMES.div),
  };

  return dataRows
    .filter((row) => isPopulatedRow(row))
    .map((row) => toCatalogEntry(row, columnIndex));
}

function isPopulatedRow(row) {
  if (!Array.isArray(row)) return false;
  return row.some((cell) => cell !== null && cell !== undefined && cell !== "");
}

function toCatalogEntry(row, columnIndex) {
  const rawCuenta = row[columnIndex.cuenta];
  const rawCodigoLlamada = row[columnIndex.codigoLlamada];

  return {
    cuenta: String(rawCuenta),
    codigoPlan: normalizeString(row[columnIndex.codigoPlan]),
    codigoLlamada:
      rawCodigoLlamada === null || rawCodigoLlamada === undefined || rawCodigoLlamada === ""
        ? null
        : String(rawCodigoLlamada),
    div: normalizeString(row[columnIndex.div]),
  };
}

function normalizeString(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
}
