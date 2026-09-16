/**
 * Pure builder for the empty input-Excel template users download and fill in
 * before uploading. Receives the XLSX library as an explicit dependency
 * (dependency injection), matching the pattern used by `parser.js` — this
 * keeps the module bundler-free and testable with either the npm `xlsx`
 * package (tests) or the vendored `window.XLSX` (`ui.js`, browser).
 *
 * Header order matches the confirmed input template columns
 * (design-decisions #1297, point 2): `N° Orden`, `Fecha`, `Concepto`,
 * `Código Cuenta`, `Denominación de Cuenta`, `Debe`, `Haber`.
 */

export const TEMPLATE_HEADER = [
  "N° Orden",
  "Fecha",
  "Concepto",
  "Código Cuenta",
  "Denominación de Cuenta",
  "Debe",
  "Haber",
];

/**
 * Extra trailing column appended by `buildErrorWorkbook` so users can see
 * per-row problems directly in Excel, fix them, and re-upload the same file.
 * `parser.js` ignores this column (case/whitespace tolerant), which makes
 * the error workbook resubmittable by design.
 */
export const ERROR_COLUMN = "Errores";

export const ERROR_HEADER = [...TEMPLATE_HEADER, ERROR_COLUMN];

// Fill + font palette for the error workbook. SheetJS Community Edition
// silently drops `s` styles on write (verified empirically: a styled cell
// round-trips as `{ patternType: "none" }`), so these are best-effort only —
// the workbook stays fully usable without color (graceful degradation).
const HEADER_FILL_RGB = "FF1F4E79";
const HEADER_FONT_RGB = "FFFFFFFF";
const ERROR_FILL_RGB = "FFFFCCCC";
const ERROR_FONT_RGB = "FF9B0000";
const WARNING_FILL_RGB = "FFFFF2CC";
const WARNING_FONT_RGB = "FF7F6000";

/**
 * Pure helper — collects the messages of every issue affecting one Excel
 * data row. Matches primarily by `rowNumber` (exact per-line match);
 * issues without a `rowNumber` fall back to an `nOrden` match so
 * asiento-level findings still surface on their rows. Accepts the
 * `{ errors, warnings }` shape from `validateBatch` or a flat array
 * (severity then falls back to `issue.severity`, defaulting to "error").
 * @param {number|null} rowNumber 1-based Excel row of the data line
 * @param {string|number|null} nOrden entry number of the data line
 * @param {{ errors?: Array<object>, warnings?: Array<object> } | Array<object>} issues
 * @returns {{ messages: string[], hasError: boolean, hasWarning: boolean }}
 */
export function messagesForRow(rowNumber, nOrden, issues) {
  /** @type {Array<{ issue: object, severity: "error"|"warning" }>} */
  const flat = [];
  if (Array.isArray(issues)) {
    for (const issue of issues) {
      flat.push({
        issue,
        severity: issue?.severity === "warning" ? "warning" : "error",
      });
    }
  } else {
    for (const issue of issues?.errors ?? []) flat.push({ issue, severity: "error" });
    for (const issue of issues?.warnings ?? []) flat.push({ issue, severity: "warning" });
  }

  /** @type {string[]} */
  const messages = [];
  let hasError = false;
  let hasWarning = false;
  const wantedOrden =
    nOrden === null || nOrden === undefined ? null : String(nOrden).trim();

  for (const { issue, severity } of flat) {
    const issueRow = issue?.rowNumber ?? null;
    const rawOrden = issue?.nOrden;
    const issueOrden =
      rawOrden === null || rawOrden === undefined ? null : String(rawOrden).trim();
    let matches = false;
    if (issueRow !== null && issueRow !== undefined && rowNumber !== null && rowNumber !== undefined) {
      matches = issueRow === rowNumber;
    } else if (
      (issueRow === null || issueRow === undefined) &&
      issueOrden !== null &&
      issueOrden !== "" &&
      wantedOrden !== null &&
      wantedOrden !== ""
    ) {
      matches = issueOrden === wantedOrden;
    }
    if (!matches) continue;
    const text = issue?.message === null || issue?.message === undefined ? "" : String(issue.message);
    if (text.trim() === "") continue;
    messages.push(text);
    if (severity === "error") hasError = true;
    else hasWarning = true;
  }

  return { messages, hasError, hasWarning };
}

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

/**
 * Builds a resubmittable error workbook: one row per original input line
 * (same order as `groups`), same 7 columns plus a trailing "Errores"
 * column with the row's messages joined by " | " (empty when clean).
 * Rows with a blocking error get a light-red fill + dark-red font, rows
 * with only warnings a light-yellow fill + brown font, clean rows no fill.
 * The header gets a dark-blue fill + bold white font. Styling is wrapped
 * so a library without style support still returns a plain usable workbook.
 * @param {typeof import("xlsx")} XLSXLib
 * @param {Array<{ nOrden: string|number, lines: Array<object> }>} groups
 * @param {{ errors?: Array<object>, warnings?: Array<object> } | Array<object>} issues
 * @returns {import("xlsx").WorkBook}
 */
export function buildErrorWorkbook(XLSXLib, groups, issues) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const dataRows = [];
  /** @type {Array<"error"|"warning"|"ok">} */
  const severities = [];

  for (const group of safeGroups) {
    for (const line of group?.lines ?? []) {
      const { messages, hasError, hasWarning } = messagesForRow(
        line?.rowNumber ?? null,
        line?.nOrden ?? group?.nOrden ?? null,
        issues
      );
      dataRows.push([
        line?.nOrden ?? null,
        line?.fecha ?? null,
        line?.concepto ?? null,
        line?.codigoCuenta ?? null,
        line?.denominacionCuenta ?? null,
        line?.debe ?? null,
        line?.haber ?? null,
        messages.join(" | "),
      ]);
      severities.push(hasError ? "error" : hasWarning ? "warning" : "ok");
    }
  }

  const worksheet = XLSXLib.utils.aoa_to_sheet([ERROR_HEADER, ...dataRows]);

  // Best-effort styling only — never allowed to break the download.
  try {
    applyErrorWorkbookStyles(XLSXLib, worksheet, severities);
  } catch {
    // Graceful degradation: plain workbook without colors still works.
  }

  try {
    worksheet["!cols"] = [
      { wch: 10 },
      { wch: 12 },
      { wch: 30 },
      { wch: 14 },
      { wch: 24 },
      { wch: 12 },
      { wch: 12 },
      { wch: 60 },
    ];
    if (worksheet["!ref"]) {
      worksheet["!autofilter"] = { ref: worksheet["!ref"] };
    }
  } catch {
    // Column widths / autofilter are cosmetic — ignore failures.
  }

  const workbook = XLSXLib.utils.book_new();
  XLSXLib.utils.book_append_sheet(workbook, worksheet, "Hoja1");
  return workbook;
}

/**
 * Applies header + per-row fills/fonts in place. Kept separate so the
 * caller can guard it with try/catch (SheetJS CE drops `s` on write but
 * never throws for setting it — verified empirically).
 */
function applyErrorWorkbookStyles(XLSXLib, worksheet, severities) {
  const range = XLSXLib.utils.decode_range(worksheet["!ref"]);

  for (let row = range.s.r; row <= range.e.r; ++row) {
    const isHeader = row === range.s.r;
    // Clean data rows keep no fill (skip styling entirely).
    if (!isHeader && (severities[row - range.s.r - 1] ?? "ok") === "ok") continue;
    const style = isHeader
      ? {
          fill: { patternType: "solid", fgColor: { rgb: HEADER_FILL_RGB } },
          font: { color: { rgb: HEADER_FONT_RGB }, bold: true },
        }
      : severities[row - range.s.r - 1] === "error"
      ? {
          fill: { patternType: "solid", fgColor: { rgb: ERROR_FILL_RGB } },
          font: { color: { rgb: ERROR_FONT_RGB } },
        }
      : {
          fill: { patternType: "solid", fgColor: { rgb: WARNING_FILL_RGB } },
          font: { color: { rgb: WARNING_FONT_RGB } },
        };
    for (let col = range.s.c; col <= range.e.c; ++col) {
      const address = XLSXLib.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[address];
      if (!cell) continue;
      cell.s = style;
    }
  }
}
