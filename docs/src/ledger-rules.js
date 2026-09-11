/**
 * Pure ledger/COA-by-account-prefix mapping.
 *
 * Business rule (confirmed against a full real year of Electro Universo
 * data, see design-decisions #1297):
 * - prefix 1/2 (patrimonial: activo/pasivo) -> ledgers 1,4,6, all COA=ARG
 * - prefix 4/5 (resultado: gastos/ingresos) -> ledgers 1,2,4,5,6, with
 *   1,4,6=ARG and 2,5=ARA
 * - any other prefix -> same mapping as 4/5, plus `unexpectedPrefix: true`
 *   (non-blocking warning upstream, not a hard error)
 *
 * @typedef {{ ledgers: number[], coaByLedger: Record<number, "ARG"|"ARA">, unexpectedPrefix: boolean }} LedgerMapping
 */

const PATRIMONIAL_PREFIXES = new Set(["1", "2"]);
const RESULTADO_PREFIXES = new Set(["4", "5"]);

const PATRIMONIAL_LEDGERS = [1, 4, 6];
const RESULTADO_LEDGERS = [1, 2, 4, 5, 6];

const LEDGER_TO_COA = { 1: "ARG", 2: "ARA", 4: "ARG", 5: "ARA", 6: "ARG" };

/**
 * @param {string} accountCode
 * @returns {LedgerMapping}
 */
export function getLedgerMapping(accountCode) {
  const prefix = String(accountCode).charAt(0);

  if (PATRIMONIAL_PREFIXES.has(prefix)) {
    return buildMapping(PATRIMONIAL_LEDGERS, false);
  }

  const unexpectedPrefix = !RESULTADO_PREFIXES.has(prefix);
  return buildMapping(RESULTADO_LEDGERS, unexpectedPrefix);
}

function buildMapping(ledgers, unexpectedPrefix) {
  const coaByLedger = {};
  for (const ledger of ledgers) {
    coaByLedger[ledger] = LEDGER_TO_COA[ledger];
  }
  return { ledgers: [...ledgers], coaByLedger, unexpectedPrefix };
}
