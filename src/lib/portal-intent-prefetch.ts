export function claimIntentPrefetch(seen: Set<string>, href: string): boolean {
  if (seen.has(href)) {
    return false;
  }

  seen.add(href);
  return true;
}
