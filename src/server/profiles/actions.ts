"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import type { Role } from "@/domain/types";
import { formValues, toFormState, type FormState } from "@/server/form-state";
import { getSessionUser, homeFor } from "@/server/session";
import { createProfile } from "./service";

export async function createProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  const values = formValues(fd);
  let role: Role;
  try {
    ({ role } = await createProfile(getDb(), user.id, values));
  } catch (error) {
    return toFormState(error, values);
  }
  redirect(homeFor(role));
}
