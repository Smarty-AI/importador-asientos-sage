/**
 * Pure ledger/COA-by-account-prefix mapping.
 *
 * BUSINESS DECISION: every account posts to ledgers 1, 4 and 6 — the ARG plan
 * only. The ARA repeats (2/5) are deliberately NOT emitted, so no analytic
 * axis (eje) is ever needed.
 *
 * Why ARA was dropped: the installed model rejects this file both ways for any
 * line that would post to an ARA ledger. With no eje line it answers error 97
 * ("Hay que indicar al menos un eje"); with any eje line the grid can express
 * it answers error 25 ("Distribución descuadrada"), because the GACCENTRYA grid
 * has only ANALIN, DIE and CCE — no field for the distribution amount, so the
 * distribution never balances against the accounting line.
 *
 * That was measured, not guessed: four eje variants (one per ARA repeat vs one
 * per accounting line, each with a value vs an empty value) were imported
 * through the model's Test button and all four failed identically, while a
 * control entry with no eje line at line imported clean. The user confirmed
 * the analysis-plan impact is not required for these adjustment entries.
 *
 * Do NOT re-add the ARA ledgers to work around a rejection. Re-adding them
 * requires the model to accept a distribution amount first, or a different
 * import model that exposes one.
 *
 * @typedef {{ ledgers: number[], coaByLedger: Record<number, "ARG">, unexpectedPrefix: boolean }} LedgerMapping
 */

const LEDGERS = [1, 4, 6];
const COA = "ARG";

/**
 * Prefixes present in the real chart of accounts. Anything else still gets the
 * safe ARG mapping, but is flagged so the validator can warn that the account
 * prefix was not recognised.
 */
const KNOWN_PREFIXES = new Set(["1", "2", "3", "4", "5", "8"]);

/**
 * @param {string} accountCode
 * @returns {LedgerMapping}
 */
export function getLedgerMapping(accountCode) {
  const prefix = String(accountCode).charAt(0);

  /** @type {Record<number, "ARG">} */
  const coaByLedger = {};
  for (const ledger of LEDGERS) {
    coaByLedger[ledger] = COA;
  }

  return {
    ledgers: [...LEDGERS],
    coaByLedger,
    unexpectedPrefix: !KNOWN_PREFIXES.has(prefix),
  };
}