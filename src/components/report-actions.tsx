"use client";

import { useActionState } from "react";
import { resolveReportAction } from "@/server/reports/actions";
import { Button } from "@/components/ui";
import { FormError } from "@/components/form-message";

export function ReportActions({ reportId, reportedFirstName, canSuspend }: { reportId: string; reportedFirstName: string; canSuspend: boolean }) {
  const [dismissState, dismiss, dismissing] = useActionState(resolveReportAction.bind(null, reportId, "dismiss"), {});
  const [suspendState, suspend, suspending] = useActionState(resolveReportAction.bind(null, reportId, "suspend"), {});
  const pending = dismissing || suspending;
  return (
    <div className="space-y-2">
      <FormError message={dismissState.error ?? suspendState.error} />
      <div className="flex flex-wrap gap-2">
        <form action={dismiss}>
          <Button type="submit" variant="secondary" disabled={pending}>Classer sans suite</Button>
        </form>
        {canSuspend && (
          <form action={suspend}>
            <Button type="submit" variant="danger" disabled={pending}>Suspendre {reportedFirstName}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
