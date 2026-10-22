"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { decideBooking, requestBooking } from "./service";

export async function requestBookingAction(mealId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("student");
  const values = formValues(fd);
  try {
    await requestBooking(getDb(), actor, mealId, { message: values.message ?? "" });
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath(`/repas/${mealId}`);
  revalidatePath("/etudiant/mes-repas");
  revalidatePath("/hote/offres");
  return { ok: true };
}

export async function decideBookingAction(
  bookingId: string,
  decision: "accept" | "decline",
  _prev: FormState,
  _fd: FormData,
): Promise<FormState> {
  const actor = await requireProfile("host");
  try {
    await decideBooking(getDb(), actor, bookingId, decision);
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/hote/offres");
  revalidatePath("/etudiant/mes-repas");
  revalidatePath("/repas");
  return { ok: true };
}
