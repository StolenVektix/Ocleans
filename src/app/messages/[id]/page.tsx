import Link from "next/link";
import { notFound } from "next/navigation";
import { ThreadView } from "@/components/thread-view";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { getThread } from "@/server/messages/service";
import { requireProfile } from "@/server/session";

export default async function MessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const thread = await getThread(getDb(), actor, id);
  if (!thread) notFound();

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Conversation avec {thread.otherFirstName}</h1>
        <p className="text-sm text-stone-600">
          {thread.mealTitle} · {formatMealDate(thread.mealStartsAt)}
        </p>
      </div>
      <ThreadView
        bookingId={thread.bookingId}
        canWrite={thread.canWrite}
        messages={thread.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      />
      <Link href={`/signaler/${thread.bookingId}`} className="inline-block text-sm text-stone-500 underline">
        Signaler un problème
      </Link>
    </main>
  );
}
