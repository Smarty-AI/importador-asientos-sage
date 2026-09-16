/**
 * Pure per-line/per-batch validation. Splits findings into blocking `errors`
 * (must be fixed before export is allowed) and non-blocking `warnings`
 * (informative only, export stays enabled) — per the confirmed business
 * rules in design-decisions #1297.
 *
 * @typedef {{ nOrden: string|number, rowNumber?: number|null, field?: string, message: string }} Issue
 */

import { lookupAccount } from "./catalog.js";
import { getLedgerMapping } from "./ledger-rules.js";

/**
 * @param {import("./parser.js").OrdenGroup[]} groups
 * @param {import("./catalog.js").Catalog} catalog
 * @returns {{ errors: Issue[], warnings: Issue[] }}
 */
export function validateBatch(groups, catalog) {
  /** @type {Issue[]} */
  const errors = [];
  /** @type {Issue[]} */
  const warnings = [];

  for (const group of groups) {
    for (const line of group.lines) {
      collectBlockingErrors(line, errors);
      collectWarnings(line, catalog, warnings);
    }
  }

  return { errors, warnings };
}

function collectBlockingErrors(line, errors) {
  const nOrden = line.nOrden;
  const rowNumber = line.rowNumber ?? null;

  if (isBlank(line.nOrden)) {
    errors.push({
      nOrden,
      rowNumber,
      field: "nOrden",
      message: `N° Orden vacío (recibido: ${formatReceived(line.nOrden)}; esperado: número de orden no vacío)`,
    });
  }
  if (!isValidFecha(line.fecha)) {
    errors.push({
      nOrden,
      rowNumber,
      field: "fecha",
      message: `Fecha inválida (recibido: ${formatReceived(line.fecha)}; esperado: fecha ISO o fecha Excel)`,
    });
  }
  if (isBlank(line.concepto)) {
    errors.push({
      nOrden,
      rowNumber,
      field: "concepto",
      message: `Concepto vacío (recibido: ${formatReceived(line.concepto)}; esperado: texto no vacío)`,
    });
  }
  if (isBlank(line.codigoCuenta)) {
    errors.push({
      nOrden,
      rowNumber,
      field: "codigoCuenta",
      message: `Código Cuenta vacío (recibido: ${formatReceived(line.codigoCuenta)}; esperado: código de cuenta numérico)`,
    });
  } else if (!isNumeric(line.codigoCuenta)) {
    errors.push({
      nOrden,
      rowNumber,
      field: "codigoCuenta",
      message: `Código Cuenta no numérico (recibido: ${formatReceived(line.codigoCuenta)}; esperado: código de cuenta numérico)`,
    });
  }

  const debeSet = !isBlankOrZero(line.debe);
  const haberSet = !isBlankOrZero(line.haber);
  if (debeSet && haberSet) {
    errors.push({
      nOrden,
      rowNumber,
      field: "debe",
      message: `Debe y Haber no pueden estar ambos completos (recibido: debe=${formatReceived(line.debe)} haber=${formatReceived(line.haber)}; esperado: solo uno completo)`,
    });
  } else if (!debeSet && !haberSet) {
    errors.push({
      nOrden,
      rowNumber,
      field: "debe",
      message: `Debe uno de Debe/Haber estar completo (recibido: ambos vacíos; esperado: un importe numérico en Debe o Haber)`,
    });
  } else {
    const field = debeSet ? "debe" : "haber";
    if (!isNumeric(line[field])) {
      errors.push({
        nOrden,
        rowNumber,
        field,
        message: `Importe de ${field} no numérico (recibido: ${formatReceived(line[field])}; esperado: importe numérico)`,
      });
    }
  }
}

function collectWarnings(line, catalog, warnings) {
  const nOrden = line.nOrden;
  const rowNumber = line.rowNumber ?? null;
  if (isBlank(line.codigoCuenta)) {
    return;
  }

  const account = lookupAccount(catalog, line.codigoCuenta);
  if (!account.exists) {
    warnings.push({
      nOrden,
      rowNumber,
      field: "codigoCuenta",
      message: `Código Cuenta ${line.codigoCuenta} no encontrado en el plan de cuentas`,
    });
  } else if (account.requiresTercero) {
    warnings.push({
      nOrden,
      rowNumber,
      field: "codigoCuenta",
      message: `La cuenta ${line.codigoCuenta} normalmente requiere tercero; se exporta sin tercero`,
    });
  }

  if (isNumeric(line.codigoCuenta)) {
    const mapping = getLedgerMapping(line.codigoCuenta);
    const prefix = String(line.codigoCuenta).charAt(0);
    const isResultadoPrefix = prefix === "4" || prefix === "5";
    const emitsARA = mapping.ledgers.includes(2) || mapping.ledgers.includes(5);
    // Second layer: any ARA-emitting mapping on a non-4/5 prefix would
    // make SAGE ask for an ARA analytic axis that does not exist.
    if (mapping.unexpectedPrefix || (emitsARA && !isResultadoPrefix)) {
      warnings.push({
        nOrden,
        rowNumber,
        field: "codigoCuenta",
        message: `Prefijo de cuenta inusual para ${line.codigoCuenta} — emitirá ledgers ARA (2/5) y SAGE pedirá eje analítico ARA`,
      });
    }
  }
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

/**
 * Business rule: numeric zero (0, "0", "0.00", " 0 ") counts as "empty", so
 * a line is valid only when exactly one side holds a non-zero importe.
 * Non-numeric values ("abc") are NOT zero — they count as set so the
 * caller reports "no numérico". SAGE uses plain Number() (no es-AR comma).
 */
function isBlankOrZero(value) {
  if (isBlank(value)) return true;
  const num = Number(String(value).trim());
  if (Number.isNaN(num)) return false;
  return num === 0;
}

/**
 * Short received-value rendering for actionable messages:
 * blank -> (empty), string -> "value", otherwise raw string form.
 */
function formatReceived(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "(vacío)";
  }
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function isNumeric(value) {
  if (isBlank(value)) return false;
  return !Number.isNaN(Number(value));
}

function isValidFecha(fecha) {
  if (isBlank(fecha)) return false;
  if (fecha instanceof Date) return !Number.isNaN(fecha.getTime());
  if (typeof fecha === "number") return fecha > 0;
  if (typeof fecha === "string") return !Number.isNaN(Date.parse(fecha));
  return false;
}
