const RETURN_TO_BASE = "http://committee-vote.local";

export function normalizeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }

  try {
    const url = new URL(value, RETURN_TO_BASE);
    if (url.origin !== RETURN_TO_BASE) return null;
    if (!/^\/(admin|vote)(?:\/|$)/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function buildLoginPath(returnTo: string): string {
  const normalized = normalizeReturnTo(returnTo);
  return normalized ? `/?next=${encodeURIComponent(normalized)}` : "/";
}
