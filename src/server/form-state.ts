import { ZodError, z } from "zod";
import { DomainError } from "@/domain/errors";

export type FormValues = Record<string, string | string[]>;

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: FormValues;
  ok?: boolean;
};

export function formValues(fd: FormData, multi: readonly string[] = []): FormValues {
  const out: FormValues = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = multi.includes(key) ? fd.getAll(key).map(String) : String(fd.get(key) ?? "");
  }
  for (const key of multi) out[key] ??= [];
  return out;
}

export function toFormState(error: unknown, values?: FormValues): FormState {
  if (error instanceof DomainError) return { error: error.message, values };
  if (error instanceof ZodError) {
    return {
      error: "Certains champs sont à corriger.",
      fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
      values,
    };
  }
  throw error;
}

// Pour les actions qui touchent un service externe (stockage) : une panne devient un message de nouvel essai
// au lieu de la page d'erreur générique, et l'utilisateur garde sa saisie (spec §8).
export function toFormStateOrRetry(error: unknown, values: FormValues, retryMessage: string): FormState {
  if (error instanceof DomainError || error instanceof ZodError) return toFormState(error, values);
  console.error("[action] échec inattendu", error);
  return { error: retryMessage, values };
}
