import Link from "next/link";
import { MarkReadButton } from "@/components/mark-read-button";
import { Card, cx } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMessageTime } from "@/domain/dates";
import { scheduleEmailDelivery } from "@/server/notifications/delivery";
import { ensureReminders, listNotifications } from "@/server/notifications/service";
import { requireProfile } from "@/server/session";

export default async function NotificationsPage() {
  const actor = await requireProfile();
  const db = getDb();
  if ((await ensureReminders(db, { userId: actor.userId })) > 0) scheduleEmailDelivery();
  const list = await listNotifications(db, actor.userId);
  const hasUnread = list.some((n) => !n.read);
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {hasUnread && <MarkReadButton />}
      </div>
      {list.length === 0 && <p className="text-stone-600">Rien de nouveau pour l'instant.</p>}
      {list.map((n) => (
        <Link key={n.id} href={n.link} className="block">
          <Card className={cx("space-y-1 transition-shadow hover:shadow-md", !n.read && "border-orange-300 bg-orange-50")}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">{n.title}</h2>
              <span className="whitespace-nowrap text-xs text-stone-500">{formatMessageTime(n.createdAt)}</span>
            </div>
            <p className="text-sm text-stone-700">{n.body}</p>
          </Card>
        </Link>
      ))}
    </main>
  );
}
