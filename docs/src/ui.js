/**
 * DOM glue ONLY — no business logic lives here. Wires:
 *   file upload -> parser.js -> validator.js (using catalog.js) ->
 *   preview table render -> download button -> sage-line-builder.js -> Blob
 *
 * Not unit-tested (by design, see `sdd/importador-sage-zxarggas-html/design`
 * Testing Strategy — manual smoke test only), EXCEPT the pure helpers
 * extracted below (`getDefaultBatchConfig`, `resolveBatchConfig`,
 * `formatIssue`, `groupIssues`, `formatGroupSummary`), which ARE unit-tested
 * in `test/ui-helpers.test.js`.
 */

import { parseWorkbook, groupByOrden } from "./parser.js";
import { loadCatalog } from "./catalog.js";
import { validateBatch } from "./validator.js";
import { buildZxarggasFile } from "./sage-line-builder.js";
import { buildErrorWorkbook, buildTemplateWorkbook } from "./template-builder.js";

/**
 * Pure helper — default batch-header configuration, confirmed 100% constant
 * over 1023/1023 real no-tercero entries (design-decisions #1297, point 3).
 * @returns {{ TYP: string, FCY: string, JOU: string, DACDIA: string, CUR: string }}
 */
export function getDefaultBatchConfig() {
  return { TYP: "AJU", FCY: "CEN", JOU: "ODG", DACDIA: "STDCO", CUR: "ARS" };
}

/**
 * Pure helper — one actionable sentence per issue for the error-detail list:
 * "Fila Excel N · Asiento {nOrden} · {field}: {message}".
 * Missing rowNumber/field degrade to "?" / "general" instead of crashing.
 * @param {{ nOrden?: string|number|null, rowNumber?: number|null, field?: string|null, message: string }} issue
 * @returns {string}
 */
export function formatIssue(issue) {
  const row = issue?.rowNumber === null || issue?.rowNumber === undefined ? "?" : issue.rowNumber;
  const orden =
    issue?.nOrden === null || issue?.nOrden === undefined || String(issue.nOrden).trim() === ""
      ? "?"
      : issue.nOrden;
  const field =
    issue?.field === null || issue?.field === undefined || String(issue.field).trim() === ""
      ? "general"
      : issue.field;
  return `Fila Excel ${row} · Asiento ${orden} · ${field}: ${issue?.message ?? ""}`;
}

/**
 * Pure helper — normalizes the grouping field; blank/missing degrades to
 * "general" instead of crashing (same fallback as `formatIssue`).
 * @param {unknown} field
 * @returns {string}
 */
function normalizeGroupField(field) {
  return field === null || field === undefined || String(field).trim() === ""
    ? "general"
    : String(field).trim();
}

/**
 * Pure helper — strips a leading "Fila Excel N · Asiento X · " prefix so
 * already-formatted sentences (e.g. `formatIssue` output fed back in) group
 * together with their raw counterparts.
 * @param {unknown} message
 * @returns {string}
 */
function normalizeGroupMessage(message) {
  if (message === null || message === undefined) return "";
  return String(message)
    .trim()
    .replace(/^Fila Excel\s+[^·]*·\s*Asiento\s+[^·]*·\s*/i, "")
    .trim();
}

/**
 * Pure helper — drops a leading "<field>:" label left over after prefix
 * stripping (e.g. "fecha: Fecha inválida" -> "Fecha inválida"), but only
 * when it matches the issue's own field, so colons inside real messages
 * are never destroyed.
 * @param {string} message
 * @param {string} field
 * @returns {string}
 */
function stripFieldLabel(message, field) {
  if (field === "general") return message;
  const label = `${field.toLowerCase()}:`;
  if (message.toLowerCase().startsWith(label)) {
    return message.slice(label.length).trim();
  }
  return message;
}

/**
 * Pure helper — clusters issues by problem type (same field + same
 * normalized message) so the UI can render one row per problem instead of
 * one row per affected Excel row. Accepts the `{ errors, warnings }` shape
 * returned by `validateBatch`, or a flat array (severity then falls back to
 * `issue.severity`, defaulting to "error").
 * Groups sort errors-first, then warnings; by count desc within severity.
 * @param {{ errors?: Array<object>, warnings?: Array<object> } | Array<object>} issues
 * @returns {Array<{ severity: "error"|"warning", field: string, message: string, count: number, rows: Array<{ rowNumber: number|null, nOrden: string|number|null }>, sample: object|null }>}
 */
export function groupIssues(issues) {
  /** @type {Map<string, { severity: "error"|"warning", field: string, message: string, count: number, rows: Array<{ rowNumber: number|null, nOrden: string|number|null }>, sample: object|null }>} */
  const groups = new Map();

  const push = (issue, severity) => {
    const field = normalizeGroupField(issue?.field);
    const message = stripFieldLabel(normalizeGroupMessage(issue?.message), field);
    const key = `${severity}\u0001${field}\u0001${message}`;
    let group = groups.get(key);
    if (!group) {
      group = { severity, field, message, count: 0, rows: [], sample: issue ?? null };
      groups.set(key, group);
    }
    group.count += 1;
    group.rows.push({
      rowNumber: issue?.rowNumber ?? null,
      nOrden: issue?.nOrden ?? null,
    });
  };

  if (Array.isArray(issues)) {
    for (const issue of issues) {
      push(issue, issue?.severity === "warning" ? "warning" : "error");
    }
  } else {
    for (const issue of issues?.errors ?? []) push(issue, "error");
    for (const issue of issues?.warnings ?? []) push(issue, "warning");
  }

  return [...groups.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    return b.count - a.count;
  });
}

/**
 * Pure helper — one summary sentence per group for the grouped error list:
 * "X filas: <message> (ej: filas 5, 8, 12 · Asientos 1, 2)". Only the first
 * 3 affected rows are sampled; the full list lives on the group itself.
 * @param {{ count?: number, rows?: Array<{ rowNumber: number|null, nOrden: string|number|null }>, message?: string }} group
 * @returns {string}
 */
export function formatGroupSummary(group) {
  const rows = group?.rows ?? [];
  const count = group?.count ?? rows.length;
  const message = group?.message ?? "";
  const sample = rows.slice(0, 3);
  const filaNums = sample
    .map((row) => (row?.rowNumber === null || row?.rowNumber === undefined ? "?" : row.rowNumber))
    .join(", ");
  const ordenNums = [
    ...new Set(
      sample.map((row) =>
        row?.nOrden === null ||
        row?.nOrden === undefined ||
        String(row.nOrden).trim() === ""
          ? "?"
          : row.nOrden
      )
    ),
  ].join(", ");
  const noun = count === 1 ? "fila" : "filas";
  return `${count} ${noun}: ${message} (ej: filas ${filaNums} · Asientos ${ordenNums})`;
}

/**
 * Pure helper — whether the "Descargar Excel con errores" button should be
 * enabled: only when there is uploaded data AND at least one issue (error
 * or warning) to fix. Accepts the `{ errors, warnings }` shape from
 * `validateBatch` or a flat array.
 * @param {Array<object>} groups OrdenGroup list from `groupByOrden`
 * @param {{ errors?: Array<object>, warnings?: Array<object> } | Array<object>} issues
 * @returns {boolean}
 */
export function shouldEnableErrorsDownload(groups, issues) {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  const errors = Array.isArray(issues) ? issues : issues?.errors ?? [];
  const warnings = Array.isArray(issues) ? [] : issues?.warnings ?? [];
  return errors.length + warnings.length > 0;
}

/**
 * Pure helper — reads the batch-config panel's current form values, falling
 * back to the confirmed defaults for any blank field.
 * @param {Partial<{ TYP: string, FCY: string, JOU: string, DACDIA: string, CUR: string }>} formValues
 */
export function resolveBatchConfig(formValues) {
  const defaults = getDefaultBatchConfig();
  const resolved = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const value = formValues?.[key];
    if (typeof value === "string" && value.trim() !== "") {
      resolved[key] = value.trim();
    }
  }
  return resolved;
}

// --- DOM glue below: only runs in a browser, guarded so Vitest (Node, no DOM) never executes it ---
if (typeof document !== "undefined") {
  initApp();
}

function initApp() {
  const fileInput = document.getElementById("file-input");
  const previewBody = document.getElementById("preview-body");
  const downloadButton = document.getElementById("download-button");
  const downloadErrorsButton = document.getElementById("download-errors-button");
  const downloadTemplateButton = document.getElementById("download-template-button");
  const statusEl = document.getElementById("status-message");
  const errorListEl = document.getElementById("error-list");
  const catalogWarningEl = document.getElementById("catalog-warning");
  const batchForm = document.getElementById("batch-config-form");

  let currentGroups = [];
  let currentIssues = { errors: [], warnings: [] };
  let catalog = new Map();

  fetch("./data/chart-of-accounts.json")
    .then((res) => res.json())
    .then((entries) => {
      catalog = loadCatalog(entries);
    })
    .catch(() => {
      // Persistent banner on its own element — never touches #status-message,
      // so later file uploads cannot overwrite it.
      setCatalogWarning(
        catalogWarningEl,
        "No se pudo cargar el plan de cuentas (advertencias limitadas)."
      );
    });

  fileInput?.addEventListener("change", async (event) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      const buffer = await file.arrayBuffer();
      const rows = parseWorkbook(buffer, window.XLSX);
      currentGroups = groupByOrden(rows);
      currentIssues = validateBatch(currentGroups, catalog);

      renderPreview(previewBody, currentGroups, currentIssues);
      renderErrorList(errorListEl, currentIssues);
      downloadButton.disabled = currentIssues.errors.length > 0;
      if (downloadErrorsButton) {
        downloadErrorsButton.disabled = !shouldEnableErrorsDownload(currentGroups, currentIssues);
      }
      setStatus(statusEl, currentIssues);
    } catch (err) {
      // Actionable message: name the file problem and the runnable next step.
      const detail = err?.message ?? String(err);
      currentGroups = [];
      currentIssues = { errors: [], warnings: [] };
      renderPreview(previewBody, currentGroups, currentIssues);
      renderErrorList(errorListEl, {
        errors: [{ message: detail }],
        warnings: [],
      });
      if (downloadButton) downloadButton.disabled = true;
      if (downloadErrorsButton) downloadErrorsButton.disabled = true;
      setStatus(
        statusEl,
        `No se pudo procesar el Excel: ${detail} — revisá el archivo y volvé a intentarlo.`
      );
    }
  });

  downloadButton?.addEventListener("click", () => {
    try {
      const batchConfig = resolveBatchConfig(readFormValues(batchForm));
      const content = buildZxarggasFile(currentGroups, batchConfig, catalog);
      downloadTextFile(content, "zxarggas_export.txt");
    } catch (err) {
      const detail = err?.message ?? String(err);
      renderErrorList(errorListEl, {
        errors: [{ message: detail }],
        warnings: [],
      });
      setStatus(statusEl, `No se pudo generar el archivo: ${detail}`);
    }
  });

  downloadTemplateButton?.addEventListener("click", () => {
    try {
      const workbook = buildTemplateWorkbook(window.XLSX);
      downloadWorkbookFile(window.XLSX, workbook, "plantilla_asientos.xlsx");
    } catch (err) {
      const detail = err?.message ?? String(err);
      setStatus(statusEl, `No se pudo generar la plantilla: ${detail}`);
    }
  });

  downloadErrorsButton?.addEventListener("click", () => {
    try {
      const workbook = buildErrorWorkbook(window.XLSX, currentGroups, currentIssues);
      downloadWorkbookFile(window.XLSX, workbook, "asientos_con_errores.xlsx");
    } catch (err) {
      const detail = err?.message ?? String(err);
      setStatus(statusEl, `No se pudo generar el Excel con errores: ${detail}`);
    }
  });
}

function readFormValues(form) {
  if (!form) return {};
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function renderPreview(tbody, groups, issues) {
  if (!tbody) return;
  tbody.innerHTML = "";

  const errorOrdens = new Set(issues.errors.map((e) => String(e.nOrden)));
  const warningOrdens = new Set(issues.warnings.map((w) => String(w.nOrden)));
  const messagesByOrden = new Map();
  for (const issue of [...issues.errors, ...issues.warnings]) {
    const key = String(issue.nOrden);
    if (!messagesByOrden.has(key)) messagesByOrden.set(key, []);
    messagesByOrden.get(key).push(formatIssue(issue));
  }

  for (const group of groups) {
    for (const line of group.lines) {
      const row = document.createElement("tr");
      const hasError = errorOrdens.has(String(group.nOrden));
      const hasWarning = warningOrdens.has(String(group.nOrden));
      row.className = hasError
        ? "bg-red-100"
        : hasWarning
        ? "bg-yellow-100"
        : "";
      // Tinted rows expose the full per-row detail on hover.
      const detail = (messagesByOrden.get(String(group.nOrden)) ?? []).join(" | ");
      if (detail) row.title = detail;

      row.innerHTML = `
        <td class="px-2 py-1">${escapeHtml(group.nOrden)}</td>
        <td class="px-2 py-1">${escapeHtml(line.fecha)}</td>
        <td class="px-2 py-1">${escapeHtml(line.concepto)}</td>
        <td class="px-2 py-1">${escapeHtml(line.codigoCuenta)}</td>
        <td class="px-2 py-1">${escapeHtml(line.denominacionCuenta)}</td>
        <td class="px-2 py-1">${escapeHtml(line.debe)}</td>
        <td class="px-2 py-1">${escapeHtml(line.haber)}</td>
      `;
      tbody.appendChild(row);
    }
  }
}

function renderErrorList(ul, issues) {
  if (!ul) return;
  ul.innerHTML = "";
  // One <li> per problem type (not per row): keeps 200+ row files readable.
  // Each group is a colored card (red = blocking error, yellow = warning)
  // with a severity badge; textContent-only rendering throughout, so issue
  // text can never inject HTML.
  const MAX_ROWS_PER_GROUP = 5;
  for (const group of groupIssues(issues)) {
    const isWarning = group.severity === "warning";
    const item = document.createElement("li");
    item.className = isWarning
      ? "list-none rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-yellow-800"
      : "list-none rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-800";

    const badge = document.createElement("span");
    badge.className = isWarning
      ? "mr-2 inline-block rounded bg-yellow-200 px-1.5 py-0.5 text-xs font-semibold text-yellow-900"
      : "mr-2 inline-block rounded bg-red-200 px-1.5 py-0.5 text-xs font-semibold text-red-900";
    badge.textContent = isWarning ? "Advertencia" : "Error";
    item.appendChild(badge);

    const header = document.createElement("strong");
    header.textContent = formatGroupSummary(group);
    item.appendChild(header);

    const nested = document.createElement("ul");
    for (const row of group.rows.slice(0, MAX_ROWS_PER_GROUP)) {
      const rowItem = document.createElement("li");
      const rowLabel =
        row.rowNumber === null || row.rowNumber === undefined ? "?" : row.rowNumber;
      const ordenLabel =
        row.nOrden === null ||
        row.nOrden === undefined ||
        String(row.nOrden).trim() === ""
          ? "?"
          : row.nOrden;
      rowItem.textContent = `Fila ${rowLabel} · Asiento ${ordenLabel}`;
      nested.appendChild(rowItem);
    }
    if (group.rows.length > MAX_ROWS_PER_GROUP) {
      const more = document.createElement("li");
      more.textContent = `+${group.rows.length - MAX_ROWS_PER_GROUP} más`;
      nested.appendChild(more);
    }
    item.appendChild(nested);
    ul.appendChild(item);
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function setStatus(el, issuesOrMessage) {
  if (!el) return;
  // Legacy path: raw strings (file-level failures) are shown as-is.
  if (typeof issuesOrMessage === "string") {
    el.textContent = issuesOrMessage;
    return;
  }
  const errorCount = issuesOrMessage?.errors?.length ?? 0;
  const warningCount = issuesOrMessage?.warnings?.length ?? 0;
  if (errorCount === 0) {
    el.textContent =
      warningCount === 0
        ? "✅ Listo para descargar: sin errores ni advertencias."
        : `✅ Listo para descargar: ${warningCount} advertencia(s) (no bloquean).`;
    return;
  }
  el.textContent =
    `⛔ ${errorCount} error(es) bloquean la descarga · ` +
    `⚠️ ${warningCount} advertencia(s) (no bloquean). ` +
    `Corregí los errores y volvé a subir.`;
}

function setCatalogWarning(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, filename);
}

function downloadWorkbookFile(XLSXLib, workbook, filename) {
  // cellStyles:true keeps the error-workbook colors when the library
  // supports them (SheetJS CE silently drops them — graceful degradation);
  // harmless for the plain template workbook.
  const buffer = XLSXLib.write(workbook, { type: "array", bookType: "xlsx", cellStyles: true });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
