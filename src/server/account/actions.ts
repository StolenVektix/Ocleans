"use server";

import { getDb } from "@/db/client";
import { getCardStorage } from "@/services/storage";
import { formValues, toFormStateOrRetry, type FormState } from "@/server/form-state";
import { scheduleEmailDelivery } from "@/server/notifications/delivery";
import { requireProfile } from "@/server/session";
import { deleteAccount } from "./service";

export async function deleteAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile();
  const values = formValues(fd);
  try {
    await deleteAccount(getDb(), getCardStorage(), actor, values);
  } catch (error) {
    return toFormStateOrRetry(error, values, "La suppression n'a pas pu aboutir. Réessayez dans un instant.");
  }
  scheduleEmailDelivery();
  return { ok: true };
}
