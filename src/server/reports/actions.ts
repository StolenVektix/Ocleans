"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { createReport, resolveReport } from "./service";

export async function createReportAction(bookingId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile();
  const values = formValues(fd);
  try {
    await createReport(getDb(), actor, bookingId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/admin/signalements");
  return { ok: true };
}

export async function resolveReportAction(
  reportId: string,
  decision: "dismiss" | "suspend",
  _prev: FormState,
  _fd: FormData,
): Promise<FormState> {
  const actor = await requireProfile("admin");
  if (decision !== "dismiss" && decision !== "suspend") return { error: "Décision inconnue." };
  try {
    await resolveReport(getDb(), actor, reportId, decision);
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/admin/signalements");
  revalidatePath("/repas");
  return { ok: true };
}
