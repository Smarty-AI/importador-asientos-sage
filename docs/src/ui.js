/**
 * DOM glue ONLY — no business logic lives here. Wires:
 *   file upload -> parser.js -> validator.js (using catalog.js) ->
 *   preview table render -> download button -> sage-line-builder.js -> Blob
 *
 * Not unit-tested (by design, see `sdd/importador-sage-zxarggas-html/design`
 * Testing Strategy — manual smoke test only), EXCEPT the pure helpers
 * extracted below (`getDefaultBatchConfig`, `resolveBatchConfig`,
 * `formatIssue`), which ARE unit-tested in `test/ui-helpers.test.js`.
 */

import { parseWorkbook, groupByOrden } from "./parser.js";
import { loadCatalog } from "./catalog.js";
import { validateBatch } from "./validator.js";
import { buildZxarggasFile } from "./sage-line-builder.js";
import { buildTemplateWorkbook } from "./template-builder.js";

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
      setStatus(
        statusEl,
        `${currentIssues.errors.length} error(es), ${currentIssues.warnings.length} advertencia(s).`
      );
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
      setStatus(
        statusEl,
        `No se pudo procesar el Excel: ${detail} — revisá el archivo y volvé a intentarlo.`
      );
    }
  });

  downloadButton?.addEventListener("click", () => {
    const batchConfig = resolveBatchConfig(readFormValues(batchForm));
    const content = buildZxarggasFile(currentGroups, batchConfig, catalog);
    downloadTextFile(content, "zxarggas_export.txt");
  });

  downloadTemplateButton?.addEventListener("click", () => {
    const workbook = buildTemplateWorkbook(window.XLSX);
    downloadWorkbookFile(window.XLSX, workbook, "plantilla_asientos.xlsx");
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
  for (const error of issues?.errors ?? []) {
    const item = document.createElement("li");
    item.className = "text-red-700";
    item.textContent = formatIssue(error);
    ul.appendChild(item);
  }
  for (const warning of issues?.warnings ?? []) {
    const item = document.createElement("li");
    item.className = "text-yellow-700";
    item.textContent = formatIssue(warning);
    ul.appendChild(item);
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function setStatus(el, message) {
  if (el) el.textContent = message;
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
  const buffer = XLSXLib.write(workbook, { type: "array", bookType: "xlsx" });
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
