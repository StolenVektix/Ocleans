"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireProfile } from "@/server/session";
import { markAllRead } from "./service";

export async function markAllReadAction(): Promise<void> {
  const actor = await requireProfile();
  await markAllRead(getDb(), actor.userId);
  revalidatePath("/notifications");
}
