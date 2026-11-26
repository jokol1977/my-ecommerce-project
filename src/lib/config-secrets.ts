const placeholderPrefixes = ["replace_with_", "change_this_", "your_"] as const;

export function hasPlaceholderPrefix(value: string | undefined): boolean {
  const normalized = value?.toLowerCase();
  return Boolean(normalized && placeholderPrefixes.some((prefix) => normalized.startsWith(prefix)));
}

export function hasPlaceholderMarker(value: string | undefined): boolean {
  const normalized = value?.toLowerCase();
  return Boolean(normalized && placeholderPrefixes.some((marker) => normalized.includes(marker)));
}

export function isUrlSafeSecret(
  value: string | undefined,
  minimumLength = 32,
  maximumLength = Number.POSITIVE_INFINITY,
): value is string {
  return Boolean(
    value && value.length >= minimumLength && value.length <= maximumLength &&
    /^[A-Za-z0-9_-]+$/.test(value) && !hasPlaceholderPrefix(value),
  );
}

export function areDistinctUrlSafeSecrets(values: readonly (string | undefined)[]): boolean {
  return values.every((value) => isUrlSafeSecret(value)) && new Set(values).size === values.length;
}
