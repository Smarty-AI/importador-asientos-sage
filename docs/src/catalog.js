/**
 * Pure chart-of-accounts lookup over the bundled, privacy-scrubbed
 * `docs/data/chart-of-accounts.json` (codes/technical fields only, no
 * descriptions — see design-decisions #1298).
 *
 * @typedef {{ cuenta: string, codigoPlan: string, codigoLlamada: string|null, div: string|null }} CatalogEntry
 * @typedef {Map<string, CatalogEntry>} Catalog
 */

/**
 * @param {CatalogEntry[]} entries
 * @returns {Catalog}
 */
export function loadCatalog(entries) {
  const catalog = new Map();
  for (const entry of entries) {
    catalog.set(entry.cuenta, entry);
  }
  return catalog;
}

/**
 * @param {Catalog} catalog
 * @param {string} code
 * @returns {{ exists: true, codigoPlan: string, codigoLlamada: string|null, requiresTercero: boolean, div: string } | { exists: false }}
 */
export function lookupAccount(catalog, code) {
  const entry = catalog.get(String(code));
  if (!entry) {
    return { exists: false };
  }

  return {
    exists: true,
    codigoPlan: entry.codigoPlan,
    codigoLlamada: entry.codigoLlamada,
    requiresTercero: entry.codigoLlamada != null && entry.codigoLlamada !== "",
    div: entry.div ?? "ARS",
  };
}
