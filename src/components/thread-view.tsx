"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { formatMessageTime } from "@/domain/dates";
import { postMessageAction } from "@/server/messages/actions";
import { Button, Textarea, cx } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export interface ThreadViewMessage {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  senderFirstName: string;
}

const REFRESH_MS = 5000;

export function ThreadView({ bookingId, canWrite, messages }: { bookingId: string; canWrite: boolean; messages: ThreadViewMessage[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(postMessageAction.bind(null, bookingId), {});
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Spec §3.2 D : rafraîchissement toutes les 5 secondes, seulement quand l'onglet est visible.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
        {messages.length === 0 && (
          <p className="text-sm text-stone-500">{canWrite ? "Pas encore de message. Présentez-vous !" : "Aucun message."}</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cx(
              "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
              m.mine ? "ml-auto bg-orange-600 text-white" : "border border-stone-200 bg-white text-stone-900",
            )}
          >
            <p className="whitespace-pre-line break-words">{m.body}</p>
            <p className="mt-1 text-[11px] opacity-75">
              {m.mine ? "Vous" : m.senderFirstName} · {formatMessageTime(new Date(m.createdAt))}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {canWrite ? (
        <form key={JSON.stringify(state.values ?? null)} action={action} className="space-y-2">
          <FormError message={state.error} />
          <Textarea name="body" required maxLength={1000} placeholder="Votre message…" defaultValue={(state.values?.body as string) ?? ""} />
          <FieldError errors={state.fieldErrors?.body} />
          <Button type="submit" disabled={pending}>{pending ? "Envoi…" : "Envoyer"}</Button>
        </form>
      ) : (
        <p className="text-sm text-stone-600">Cette conversation est fermée (repas annulé ou terminé depuis plus de 7 jours).</p>
      )}
    </div>
  );
}
