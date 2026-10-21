import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "@/domain/routes";
import { auth } from "@/lib/auth/server";

const neonAuthMiddleware = auth.middleware({ loginUrl: "/connexion" });

// Le middleware Neon Auth rafraîchit (ou efface) le cookie de session : il doit passer sur toutes les pages,
// sinon getSession() tente de modifier les cookies pendant le rendu et la page plante.
export default async function proxy(request: NextRequest) {
  const response = await neonAuthMiddleware(request);
  if (isProtectedPath(request.nextUrl.pathname) || !response.headers.has("location")) return response;
  // Page publique sans session valide : pas de redirection vers la connexion. Les cookies effacés le sont
  // aussi dans la requête transmise au rendu, pour que getSession() n'essaie pas de les modifier.
  const cleared = response.cookies.getAll();
  for (const cookie of cleared) request.cookies.delete(cookie.name);
  const next = NextResponse.next({ request: { headers: request.headers } });
  for (const cookie of cleared) next.cookies.set(cookie);
  return next;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
