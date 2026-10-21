import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/connexion" });

export const config = {
  matcher: ["/etudiant/:path*", "/hote/:path*", "/bienvenue"],
};
