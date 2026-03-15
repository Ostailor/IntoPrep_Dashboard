export function normalizeSourceUrl(
  value: string,
  label = "Linked CSV sync",
) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(`${label} URL is required.`);
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Add a valid ${label} URL.`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${label} URL must use http or https.`);
  }

  return parsed.toString();
}
