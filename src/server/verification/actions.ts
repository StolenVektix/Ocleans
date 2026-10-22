"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getCardStorage } from "@/services/storage";
import { toFormState, toFormStateOrRetry, type FormState } from "@/server/form-state";
import { scheduleEmailDelivery } from "@/server/notifications/delivery";
import { requireProfile } from "@/server/session";
import { confirmUniversityEmail, reviewCard, submitStudentCard } from "./service";

export async function confirmUniversityEmailAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  const actor = await requireProfile("student");
  try {
    await confirmUniversityEmail(getDb(), actor);
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/etudiant/verification");
  revalidatePath("/repas");
  return { ok: true };
}

export async function submitStudentCardAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("student");
  const values = { school: String(fd.get("school") ?? ""), studentNumber: String(fd.get("studentNumber") ?? "") };
  const entry = fd.get("card");
  const file = entry instanceof File ? entry : null;
  try {
    await submitStudentCard(getDb(), getCardStorage(), actor, values, {
      type: file?.type ?? "",
      size: file?.size ?? 0,
      bytes: file ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array(),
    });
  } catch (error) {
    return toFormStateOrRetry(error, values, "Envoi de la photo impossible pour le moment. Réessayez dans quelques instants.");
  }
  revalidatePath("/etudiant/verification");
  revalidatePath("/admin/verifications");
  return { ok: true };
}

export async function reviewCardAction(
  verificationId: string,
  decision: "approve" | "reject",
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const actor = await requireProfile("admin");
  if (decision !== "approve" && decision !== "reject") return { error: "Décision inconnue." };
  const values = { reason: String(fd.get("reason") ?? "") };
  try {
    await reviewCard(getDb(), getCardStorage(), actor, verificationId, decision, values);
  } catch (error) {
    return toFormStateOrRetry(error, values, "Décision non enregistrée pour le moment. Réessayez.");
  }
  revalidatePath("/admin/verifications");
  scheduleEmailDelivery();
  return { ok: true };
}
