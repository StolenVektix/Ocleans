"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { requireProfile } from "@/server/session";
import { cancelMeal, createMeal, updateMeal } from "./service";

export async function createMealAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("host");
  const values = formValues(fd, ["dietTags"]);
  try {
    await createMeal(getDb(), actor, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/hote/offres");
  revalidatePath("/repas");
  redirect("/hote/offres");
}

export async function updateMealAction(mealId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("host");
  const values = formValues(fd, ["dietTags"]);
  try {
    await updateMeal(getDb(), actor, mealId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/hote/offres");
  revalidatePath("/repas");
  revalidatePath(`/repas/${mealId}`);
  redirect("/hote/offres");
}

export async function cancelMealAction(mealId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireProfile("host");
  const values = formValues(fd);
  try {
    await cancelMeal(getDb(), actor, mealId, values);
  } catch (error) {
    return toFormState(error, values);
  }
  revalidatePath("/hote/offres");
  revalidatePath("/repas");
  revalidatePath("/etudiant/mes-repas");
  return { ok: true };
}
