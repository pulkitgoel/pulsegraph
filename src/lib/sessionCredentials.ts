let deepSeekApiKey = '';

/** Ephemeral credential storage that survives React remounts, but never a page reload. */
export function readSessionApiKey(): string {
  return deepSeekApiKey;
}

export function writeSessionApiKey(key: string): void {
  deepSeekApiKey = key;
}

export function clearSessionApiKey(): void {
  deepSeekApiKey = '';
}
