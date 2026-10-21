import { DIET_TAGS, type DietTag } from "@/config/diet-tags";
import { Badge } from "@/components/ui";

export function DietBadges({ tags }: { tags: DietTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <Badge key={tag} tone="green">{DIET_TAGS[tag]}</Badge>
      ))}
    </div>
  );
}
