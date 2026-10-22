"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { scheduleEmailDelivery } from "@/server/notifications/delivery";
import { requireProfile } from "@/server/session";
import { cancelBooking, decideBooking, requestBooking } from "./service";

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
  scheduleEmailDelivery();
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
  scheduleEmailDelivery();
  return { ok: true };
}

export async function cancelBookingAction(bookingId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("student");
  const values = formValues(fd);
  try {
    await cancelBooking(getDb(), actor, bookingId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/etudiant/mes-repas");
  revalidatePath("/hote/offres");
  revalidatePath("/repas");
  scheduleEmailDelivery();
  return { ok: true };
}
