export const SETTINGS_NAMESPACE = "kolmopdf";
export const DEFAULT_API_KEY_ENV = "KOLMOPDF_API_KEY";

/** Credential reference used by the GUI settings page (managed credential store). */
export const CREDENTIAL_REF = DEFAULT_API_KEY_ENV;

/** Reject API keys that could break or corrupt HTTP headers. */
export function validateApiKey(key: string): string | undefined {
  const trimmed = key.trim();
  if (trimmed.length === 0) return "API key must not be empty";
  if (/[\u0000-\u0020\u007f]/u.test(trimmed)) return "API key contains whitespace or control characters";
  return undefined;
}
