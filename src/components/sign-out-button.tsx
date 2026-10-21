"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-stone-600 underline-offset-2 hover:underline"
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Déconnexion
    </button>
  );
}
