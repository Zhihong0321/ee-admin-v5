/**
 * `seda_registration` file columns are plain `text`, but Bubble writes
 * multi-upload fields into them as a JSON-encoded array string while legacy
 * rows hold a single bare URL. Both shapes must resolve to the same list.
 */

function nonEmptyStrings(values: unknown[]): string[] {
  return values.filter(
    (value): value is string => typeof value === "string" && value.trim() !== ""
  );
}

export function parseFileUrls(value: unknown): string[] {
  if (value == null) return [];

  if (Array.isArray(value)) return nonEmptyStrings(value);

  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (trimmed === "") return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return nonEmptyStrings(parsed);
    } catch {
      // Unparseable — fall through so the raw value surfaces instead of vanishing.
    }
  }

  return [trimmed];
}

export function serializeFileUrls(urls: string[]): string | null {
  const clean = urls.map((url) => url.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  return clean.length === 1 ? clean[0] : JSON.stringify(clean);
}
