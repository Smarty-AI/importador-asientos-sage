/**
 * Pure builder for the empty input-Excel template users download and fill in
 * before uploading. Receives the XLSX library as an explicit dependency
 * (dependency injection), matching the pattern used by `parser.js` — this
 * keeps the module bundler-free and testable with either the npm `xlsx`
 * package (tests) or the vendored `window.XLSX` (`ui.js`, browser).
 *
 * Header order matches the confirmed input template columns
 * (design-decisions #1297, point 2): `N° Asiento`, `Fecha`, `Concepto`,
 * `Código Cuenta`, `Denominación de Cuenta`, `Debe`, `Haber`.
 */

export const TEMPLATE_HEADER = [
  "N° Asiento",
  "Fecha",
  "Concepto",
  "Código Cuenta",
  "Denominación de Cuenta",
  "Debe",
  "Haber",
];

/**
 * @param {typeof import("xlsx")} XLSXLib
 * @returns {import("xlsx").WorkBook}
 */
export function buildTemplateWorkbook(XLSXLib) {
  const worksheet = XLSXLib.utils.aoa_to_sheet([TEMPLATE_HEADER]);
  const workbook = XLSXLib.utils.book_new();
  XLSXLib.utils.book_append_sheet(workbook, worksheet, "Hoja1");
  return workbook;
}
