"use client";

import { useTransition } from "react";
import { markAllReadAction } from "@/server/notifications/actions";
import { Button } from "@/components/ui";

export function MarkReadButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={() => startTransition(() => markAllReadAction())}>
      {pending ? "…" : "Tout marquer comme lu"}
    </Button>
  );
}
