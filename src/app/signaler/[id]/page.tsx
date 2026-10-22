import { notFound } from "next/navigation";
import { ReportForm } from "@/components/report-form";
import { Card } from "@/components/ui";
import { getDb } from "@/db/client";
import { getReportTarget } from "@/server/reports/service";
import { requireProfile } from "@/server/session";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const target = await getReportTarget(getDb(), actor, id);
  if (!target) notFound();
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-2xl font-semibold">Signaler un problème avec {target.otherFirstName}</h1>
      <p className="text-sm text-stone-600">Repas : {target.mealTitle}</p>
      <Card>
        <ReportForm bookingId={target.bookingId} />
      </Card>
    </main>
  );
}
