"use client";

import { useActionState } from "react";
import { decideBookingAction } from "@/server/bookings/actions";
import { Button } from "@/components/ui";
import { FormError } from "@/components/form-message";

export function DecisionButtons({ bookingId }: { bookingId: string }) {
  const [acceptState, accept, accepting] = useActionState(decideBookingAction.bind(null, bookingId, "accept"), {});
  const [declineState, decline, declining] = useActionState(decideBookingAction.bind(null, bookingId, "decline"), {});
  const pending = accepting || declining;
  return (
    <div className="space-y-2">
      <FormError message={acceptState.error ?? declineState.error} />
      <div className="flex gap-2">
        <form action={accept}>
          <Button type="submit" disabled={pending}>Accepter</Button>
        </form>
        <form action={decline}>
          <Button type="submit" variant="secondary" disabled={pending}>Refuser</Button>
        </form>
      </div>
    </div>
  );
}
