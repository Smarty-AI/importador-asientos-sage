/**
 * DOM glue ONLY — no business logic lives here. Wires:
 *   file upload -> parser.js -> validator.js (using catalog.js) ->
 *   preview table render -> download button -> sage-line-builder.js -> Blob
 *
 * Not unit-tested (by design, see `sdd/importador-sage-zxarggas-html/design`
 * Testing Strategy — manual smoke test only), EXCEPT the one pure helper
 * extracted below (`getDefaultBatchConfig`), which IS unit-tested in
 * `test/ui-helpers.test.js`.
 */

import { parseWorkbook, groupByAsiento } from "./parser.js";
import { loadCatalog } from "./catalog.js";
import { validateBatch } from "./validator.js";
import { buildZxarggasFile } from "./sage-line-builder.js";

/**
 * Pure helper — default batch-header configuration, confirmed 100% constant
 * over 1023/1023 real no-tercero entries (design-decisions #1297, point 3).
 * @returns {{ TYP: string, FCY: string, JOU: string, DACDIA: string, CUR: string }}
 */
export function getDefaultBatchConfig() {
  return { TYP: "AJU", FCY: "CEN", JOU: "ODG", DACDIA: "STDCO", CUR: "ARS" };
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
  const statusEl = document.getElementById("status-message");
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
      setStatus(statusEl, "No se pudo cargar el plan de cuentas (advertencias limitadas).");
    });

  fileInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const rows = parseWorkbook(buffer, window.XLSX);
    currentGroups = groupByAsiento(rows);
    currentIssues = validateBatch(currentGroups, catalog);

    renderPreview(previewBody, currentGroups, currentIssues);
    downloadButton.disabled = currentIssues.errors.length > 0;
    setStatus(
      statusEl,
      `${currentIssues.errors.length} error(es), ${currentIssues.warnings.length} advertencia(s).`
    );
  });

  downloadButton?.addEventListener("click", () => {
    const batchConfig = resolveBatchConfig(readFormValues(batchForm));
    const content = buildZxarggasFile(currentGroups, batchConfig, catalog);
    downloadTextFile(content, "zxarggas_export.txt");
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

  const errorAsientos = new Set(issues.errors.map((e) => String(e.nAsiento)));
  const warningAsientos = new Set(issues.warnings.map((w) => String(w.nAsiento)));

  for (const group of groups) {
    for (const line of group.lines) {
      const row = document.createElement("tr");
      const hasError = errorAsientos.has(String(group.nAsiento));
      const hasWarning = warningAsientos.has(String(group.nAsiento));
      row.className = hasError
        ? "bg-red-100"
        : hasWarning
        ? "bg-yellow-100"
        : "";

      row.innerHTML = `
        <td class="px-2 py-1">${escapeHtml(group.nAsiento)}</td>
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

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function setStatus(el, message) {
  if (el) el.textContent = message;
}

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
