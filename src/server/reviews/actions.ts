"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { submitReview } from "./service";

export async function submitReviewAction(bookingId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile();
  const values = formValues(fd);
  try {
    await submitReview(getDb(), actor, bookingId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/etudiant/mes-repas");
  revalidatePath("/hote/offres");
  revalidatePath("/repas");
  return { ok: true };
}
