import { describe, expect, it } from "vitest";
import { DEFAULTS, maskApiKey, missingApiKeyMessage, resolveConfig } from "../src/config.js";
import { validateApiKey } from "../src/constants.js";

describe("resolveConfig", () => {
  it("uses defaults without a key", () => {
    const value = resolveConfig({}, {});
    expect(value.apiKey).toBeUndefined();
    expect(value.baseUrl).toBe(DEFAULTS.baseUrl);
    expect(value.apiKeyEnv).toBe("KOLMOPDF_API_KEY");
  });

  it("prefers a literal secret over the configured environment", () => {
    const value = resolveConfig({ apiKey: " literal ", apiKeyEnv: "CUSTOM", baseUrl: "https://example.test///" }, { CUSTOM: "ambient" });
    expect(value.apiKey).toBe("literal");
    expect(value.baseUrl).toBe("https://example.test");
  });

  it("falls back to the named environment variable", () => {
    expect(resolveConfig({ apiKeyEnv: "CUSTOM" }, { CUSTOM: " sk-env " }).apiKey).toBe("sk-env");
  });
});

describe("API key presentation", () => {
  it("never returns a complete key", () => {
    expect(maskApiKey("sk-1234567890abcdef")).toBe("sk-123***cdef");
    expect(maskApiKey("short")).toBe("***");
  });

  it("provides settings and CLI remediation", () => {
    const message = missingApiKeyMessage();
    expect(message).toContain("Settings → KolmoPDF");
    expect(message).toContain("dsh plugin --profile web exec kolmopdf -- config set-key");
  });
});

describe("validateApiKey", () => {
  it("accepts ordinary keys and rejects empty or header-unsafe input", () => {
    expect(validateApiKey("sk-1234567890abcdef")).toBeUndefined();
    expect(validateApiKey("  ")).toMatch(/empty/);
    expect(validateApiKey("sk-1 2")).toMatch(/whitespace/);
    expect(validateApiKey("sk-1\u0000bad")).toMatch(/control/);
  });
});
