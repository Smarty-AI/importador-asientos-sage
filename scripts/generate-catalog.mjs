#!/usr/bin/env node
/**
 * Dev-time-only glue script. Reads the real, sensitive `sage/Plan de cuentas
 * EU.xlsx` chart of accounts directly from the local filesystem (gitignored,
 * never present in CI), transforms it with the pure `transformRows()`
 * function, and writes the privacy-scrubbed `docs/data/chart-of-accounts.json`
 * that IS committed and shipped with the public static site.
 *
 * This script itself is never shipped to `docs/` and its `xlsx` npm
 * dependency is dev-only — do not import this file from any `docs/src/*`
 * module.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { transformRows } from "./catalog-transform.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const SOURCE_PATH = resolve(projectRoot, "sage", "Plan de cuentas EU.xlsx");
const OUTPUT_PATH = resolve(projectRoot, "docs", "data", "chart-of-accounts.json");

export function generateCatalog(sourcePath = SOURCE_PATH, outputPath = OUTPUT_PATH) {
  const workbook = XLSX.readFile(sourcePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const entries = transformRows(rawRows);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(entries, null, 2) + "\n", "utf8");

  return entries;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  try {
    const entries = generateCatalog();
    console.log(`Generated ${OUTPUT_PATH} with ${entries.length} account entries.`);
  } catch (err) {
    console.error("Failed to generate chart-of-accounts.json:", err.message);
    console.error(
      `Expected source file at: ${SOURCE_PATH}\n` +
        "This file is gitignored and only exists in local development environments."
    );
    process.exitCode = 1;
  }
}
