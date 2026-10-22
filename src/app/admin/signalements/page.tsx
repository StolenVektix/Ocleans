import { ReportActions } from "@/components/report-actions";
import { Badge, Card } from "@/components/ui";
import { getDb } from "@/db/client";
import { formatMealDate } from "@/domain/dates";
import { listOpenReports } from "@/server/reports/service";
import { requireProfile } from "@/server/session";

const ROLE_LABELS = { student: "étudiant·e", host: "hôte", admin: "admin" } as const;

export default async function AdminReportsPage() {
  const actor = await requireProfile("admin");
  const list = await listOpenReports(getDb(), actor);
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Signalements ouverts ({list.length})</h1>
      {list.length === 0 && <p className="text-stone-600">Aucun signalement en attente.</p>}
      {list.map((r) => (
        <Card key={r.id} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{r.reporterFirstName} signale {r.reportedFirstName}</h2>
            <Badge>{ROLE_LABELS[r.reportedRole]}</Badge>
            {r.reportedSuspended && <Badge tone="red">Déjà suspendu</Badge>}
          </div>
          <p className="text-sm text-stone-600">
            {r.mealTitle ? `Repas : ${r.mealTitle} · ` : ""}signalé {formatMealDate(r.createdAt)}
          </p>
          <p className="whitespace-pre-line rounded-lg bg-stone-50 p-3">{r.reason}</p>
          <p className="text-xs text-stone-500">
            Suspendre annule les repas et les demandes à venir de ce compte, qui ne pourra plus se connecter.
          </p>
          <ReportActions reportId={r.id} reportedFirstName={r.reportedFirstName} canSuspend={!r.reportedSuspended && r.reportedRole !== "admin"} />
        </Card>
      ))}
    </main>
  );
}
