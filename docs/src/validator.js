/**
 * Pure per-line/per-batch validation. Splits findings into blocking `errors`
 * (must be fixed before export is allowed) and non-blocking `warnings`
 * (informative only, export stays enabled) — per the confirmed business
 * rules in design-decisions #1297.
 *
 * @typedef {{ nAsiento: string|number, field?: string, message: string }} Issue
 */

import { lookupAccount } from "./catalog.js";
import { getLedgerMapping } from "./ledger-rules.js";

/**
 * @param {import("./parser.js").AsientoGroup[]} groups
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
  const nAsiento = line.nAsiento;

  if (isBlank(line.nAsiento)) {
    errors.push({ nAsiento, field: "nAsiento", message: "N° Asiento vacío" });
  }
  if (!isValidFecha(line.fecha)) {
    errors.push({ nAsiento, field: "fecha", message: "Fecha inválida" });
  }
  if (isBlank(line.concepto)) {
    errors.push({ nAsiento, field: "concepto", message: "Concepto vacío" });
  }
  if (isBlank(line.codigoCuenta)) {
    errors.push({ nAsiento, field: "codigoCuenta", message: "Código Cuenta vacío" });
  } else if (!isNumeric(line.codigoCuenta)) {
    errors.push({ nAsiento, field: "codigoCuenta", message: "Código Cuenta no numérico" });
  }

  const debeSet = !isBlank(line.debe);
  const haberSet = !isBlank(line.haber);
  if (debeSet && haberSet) {
    errors.push({
      nAsiento,
      field: "debe",
      message: "Debe y Haber no pueden estar ambos completos",
    });
  } else if (!debeSet && !haberSet) {
    errors.push({
      nAsiento,
      field: "debe",
      message: "Debe uno de Debe/Haber estar completo",
    });
  } else {
    const field = debeSet ? "debe" : "haber";
    if (!isNumeric(line[field])) {
      errors.push({ nAsiento, field, message: `Importe de ${field} no numérico` });
    }
  }
}

function collectWarnings(line, catalog, warnings) {
  const nAsiento = line.nAsiento;
  if (isBlank(line.codigoCuenta)) {
    return;
  }

  const account = lookupAccount(catalog, line.codigoCuenta);
  if (!account.exists) {
    warnings.push({
      nAsiento,
      field: "codigoCuenta",
      message: `Código Cuenta ${line.codigoCuenta} no encontrado en el plan de cuentas`,
    });
  } else if (account.requiresTercero) {
    warnings.push({
      nAsiento,
      field: "codigoCuenta",
      message: `La cuenta ${line.codigoCuenta} normalmente requiere tercero; se exporta sin tercero`,
    });
  }

  if (isNumeric(line.codigoCuenta)) {
    const mapping = getLedgerMapping(line.codigoCuenta);
    if (mapping.unexpectedPrefix) {
      warnings.push({
        nAsiento,
        field: "codigoCuenta",
        message: `Prefijo de cuenta inusual para ${line.codigoCuenta}`,
      });
    }
  }
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
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
