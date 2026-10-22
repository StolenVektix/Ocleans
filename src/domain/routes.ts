const PROTECTED_PREFIXES = ["/etudiant", "/hote", "/admin", "/messages", "/avis", "/signaler", "/notifications", "/bienvenue"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
