"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { postMessage } from "./service";

export async function postMessageAction(bookingId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile();
  const values = formValues(fd);
  try {
    await postMessage(getDb(), actor, bookingId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath(`/messages/${bookingId}`);
  return { ok: true };
}
