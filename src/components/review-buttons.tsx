"use client";

import { useActionState } from "react";
import { reviewCardAction } from "@/server/verification/actions";
import { Button, Input, Label } from "@/components/ui";
import { FieldError, FormError } from "@/components/form-message";

export function ReviewButtons({ verificationId }: { verificationId: string }) {
  const [approveState, approve, approving] = useActionState(reviewCardAction.bind(null, verificationId, "approve"), {});
  const [rejectState, reject, rejecting] = useActionState(reviewCardAction.bind(null, verificationId, "reject"), {});
  const pending = approving || rejecting;
  return (
    <div className="space-y-3">
      <FormError message={approveState.error ?? rejectState.error} />
      <form action={approve}>
        <Button type="submit" disabled={pending} className="w-full">Valider la carte</Button>
      </form>
      <form action={reject} className="space-y-2">
        <Label htmlFor={`reason-${verificationId}`}>Motif du refus</Label>
        <Input id={`reason-${verificationId}`} name="reason" maxLength={300} placeholder="Ex. : photo illisible, carte expirée" />
        <FieldError errors={rejectState.fieldErrors?.reason} />
        <Button type="submit" variant="danger" disabled={pending} className="w-full">Refuser</Button>
      </form>
    </div>
  );
}
