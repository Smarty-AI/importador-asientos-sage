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
 *   rowNumber: number|null,
 * }} RawRow
 *
 * @typedef {{ nOrden: string|number, lines: RawRow[] }} OrdenGroup
 */

/**
 * Single source of truth for the expected input header row (header = Excel
 * row 1). Must stay in sync with `template-builder.js` TEMPLATE_HEADER —
 * covered by a contract test in `test/parser.test.js`.
 */
export const EXPECTED_HEADERS = [
  "N° Orden",
  "Fecha",
  "Concepto",
  "Código Cuenta",
  "Denominación de Cuenta",
  "Debe",
  "Haber",
];

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
 * Pure header comparison — no throw, just facts for the caller and tests.
 * Order-sensitive: a reordered row is a mismatch.
 * @param {unknown[]} receivedHeaders
 * @returns {{ ok: boolean, expected: string[], received: string[], missing: string[], unexpected: string[] }}
 */
export function checkHeaders(receivedHeaders) {
  const received = Array.isArray(receivedHeaders) ? receivedHeaders.map(String) : [];
  const missing = EXPECTED_HEADERS.filter((h) => !received.includes(h));
  const unexpected = received.filter((h) => !EXPECTED_HEADERS.includes(h));
  const sameOrder =
    received.length === EXPECTED_HEADERS.length &&
    EXPECTED_HEADERS.every((h, i) => received[i] === h);
  return {
    ok: sameOrder && missing.length === 0 && unexpected.length === 0,
    expected: [...EXPECTED_HEADERS],
    received,
    missing,
    unexpected,
  };
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {typeof import("xlsx")} XLSXLib
 * @returns {RawRow[]}
 */
export function parseWorkbook(arrayBuffer, XLSXLib) {
  const workbook = XLSXLib.read(arrayBuffer, { type: "array" });
  assertWorkbookNotEmpty(workbook);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  assertSheetFound(sheet);
  assertHeadersMatch(readHeaderRow(sheet, XLSXLib));
  const rawRecords = XLSXLib.utils.sheet_to_json(sheet, { defval: null });
  assertHasDataRows(rawRecords);

  return rawRecords.map((record, index) => toRawRow(record, index + 2));
}

function readHeaderRow(sheet, XLSXLib) {
  const rows = XLSXLib.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headerRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : [];
  return (Array.isArray(headerRow) ? headerRow : []).filter(
    (cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""
  );
}

function assertWorkbookNotEmpty(workbook) {
  if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
    throw new Error(
      `Libro Excel vacío: no se encontraron hojas (recibido: 0 hojas; esperado: una hoja con encabezados: ${EXPECTED_HEADERS.join(", ")})`
    );
  }
}

function assertSheetFound(sheet) {
  if (!sheet) {
    throw new Error(
      `Hoja no encontrada: la primera hoja está vacía o no existe (recibido: hoja ausente; esperado: una hoja con encabezados: ${EXPECTED_HEADERS.join(", ")})`
    );
  }
}

function assertHeadersMatch(receivedHeaders) {
  const check = checkHeaders(receivedHeaders);
  if (!check.ok) {
    const receivedText = check.received.length > 0 ? check.received.join(", ") : "(vacío)";
    throw new Error(
      `Encabezados inválidos — un solo error bloqueante (recibido: ${receivedText}; esperado: ${check.expected.join(", ")})`
    );
  }
}

function assertHasDataRows(rawRecords) {
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    throw new Error(
      "Sin filas de datos: solo se encontró el encabezado (recibido: 0 filas; esperado: al menos 1 fila de datos)"
    );
  }
}

function toRawRow(record, rowNumber) {
  /** @type {Partial<RawRow>} */
  const row = {};
  for (const [excelHeader, fieldName] of Object.entries(HEADER_MAP)) {
    row[fieldName] = Object.prototype.hasOwnProperty.call(record, excelHeader)
      ? record[excelHeader]
      : null;
  }
  row.rowNumber = rowNumber;
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
