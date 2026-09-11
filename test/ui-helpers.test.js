import { describe, it, expect } from "vitest";
import { getDefaultBatchConfig, resolveBatchConfig } from "../docs/src/ui.js";

// Only the DOM-free pure helpers extracted from `ui.js` are unit-tested here.
// `ui.js`'s DOM-wiring code is guarded (`typeof document !== "undefined"`)
// and covered only by manual smoke test, per design.

describe("getDefaultBatchConfig", () => {
  it("returns the confirmed batch-header defaults", () => {
    expect(getDefaultBatchConfig()).toEqual({
      TYP: "AJU",
      FCY: "CEN",
      JOU: "ODG",
      DACDIA: "STDCO",
      CUR: "ARS",
    });
  });
});

describe("resolveBatchConfig", () => {
  it("falls back to defaults when no form values are provided", () => {
    expect(resolveBatchConfig({})).toEqual(getDefaultBatchConfig());
  });

  it("overrides a default with a non-blank user-provided value", () => {
    const result = resolveBatchConfig({ JOU: "DIA" });

    expect(result.JOU).toBe("DIA");
    expect(result.TYP).toBe("AJU");
  });

  it("ignores a blank/whitespace-only override and keeps the default", () => {
    const result = resolveBatchConfig({ CUR: "   " });

    expect(result.CUR).toBe("ARS");
  });
});
