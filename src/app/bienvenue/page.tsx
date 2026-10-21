import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";
import { getCurrentProfile, getSessionUser, homeFor } from "@/server/session";

export default async function WelcomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  const profile = await getCurrentProfile();
  if (profile) redirect(homeFor(profile.role));
  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Bienvenue sur Ocleans</h1>
      <p className="text-stone-600">Dites-nous qui vous êtes pour finir votre inscription.</p>
      <OnboardingForm defaultFirstName={user.name} />
    </main>
  );
}
