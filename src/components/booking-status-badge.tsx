import type { BookingStatus } from "@/domain/types";
import { Badge, type BadgeTone } from "@/components/ui";

const LABELS: Record<BookingStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "En attente", tone: "amber" },
  accepted: { label: "Acceptée", tone: "green" },
  declined: { label: "Refusée", tone: "red" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { label, tone } = LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
