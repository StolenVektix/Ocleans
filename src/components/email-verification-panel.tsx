"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { confirmUniversityEmailAction } from "@/server/verification/actions";
import { Button, Input, Label } from "@/components/ui";
import { FormError } from "@/components/form-message";

export function EmailVerificationPanel({ email, alreadyConfirmed }: { email: string; alreadyConfirmed: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"start" | "code">(alreadyConfirmed ? "code" : "start");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();

  async function confirmOnServer() {
    const result = await confirmUniversityEmailAction({}, new FormData());
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function sendCode() {
    setPending(true);
    setError(undefined);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    setPending(false);
    if (error) {
      setError("Impossible d'envoyer le code pour le moment. Réessayez dans quelques minutes.");
      return;
    }
    setInfo(`Un code à 6 chiffres vient d'être envoyé à ${email}. Pensez à vérifier vos spams.`);
    setStep("code");
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const otp = String(new FormData(event.currentTarget).get("otp") ?? "").trim();
    setPending(true);
    setError(undefined);
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
    if (error) {
      setPending(false);
      setError(
        error.code === "TOO_MANY_ATTEMPTS"
          ? "Trop d'essais. Demandez un nouveau code."
          : "Code incorrect ou expiré. Vérifiez-le ou demandez un nouveau code.",
      );
      return;
    }
    await confirmOnServer();
    setPending(false);
  }

  if (alreadyConfirmed) {
    return (
      <div className="space-y-3">
        <p className="text-stone-700">Votre adresse {email} est déjà confirmée.</p>
        <FormError message={error} />
        <Button type="button" disabled={pending} onClick={async () => { setPending(true); await confirmOnServer(); setPending(false); }}>
          Valider mon statut étudiant
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FormError message={error} />
      {info && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{info}</p>}
      {step === "start" ? (
        <Button type="button" disabled={pending} onClick={sendCode}>
          {pending ? "Envoi…" : `Recevoir un code à ${email}`}
        </Button>
      ) : (
        <form onSubmit={verifyCode} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="otp">Code reçu par email</Label>
            <Input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Vérification…" : "Valider le code"}</Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={sendCode}>Renvoyer un code</Button>
          </div>
        </form>
      )}
    </div>
  );
}
