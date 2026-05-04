const DEFAULT_ADMIN_REDIRECT = "/admin";
const REDIRECT_BASE = "https://agent-z.local";

export function getSafeAdminRedirect(value: string | null | undefined): string {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return DEFAULT_ADMIN_REDIRECT;
  }

  try {
    const url = new URL(candidate, REDIRECT_BASE);
    if (url.origin !== REDIRECT_BASE) {
      return DEFAULT_ADMIN_REDIRECT;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_ADMIN_REDIRECT;
  }
}
