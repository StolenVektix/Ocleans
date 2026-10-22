import Link from "next/link";
import { DIET_TAGS, DIET_TAG_KEYS } from "@/config/diet-tags";
import { NEIGHBORHOODS } from "@/config/neighborhoods";
import { Button, Input, Label, Select } from "@/components/ui";

export function MealFilters({ quartier, regime, jour, vue }: { quartier?: string; regime?: string; jour?: string; vue?: string }) {
  return (
    <form method="get" className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-4 sm:items-end">
      {vue === "carte" && <input type="hidden" name="vue" value="carte" />}
      <div className="space-y-1">
        <Label htmlFor="quartier">Quartier</Label>
        <Select id="quartier" name="quartier" defaultValue={quartier ?? ""}>
          <option value="">Tous</option>
          {NEIGHBORHOODS.map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="regime">Régime</Label>
        <Select id="regime" name="regime" defaultValue={regime ?? ""}>
          <option value="">Tous</option>
          {DIET_TAG_KEYS.map((t) => <option key={t} value={t}>{DIET_TAGS[t]}</option>)}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="jour">Jour</Label>
        <Input id="jour" name="jour" type="date" defaultValue={jour ?? ""} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Filtrer</Button>
        <Link href="/repas" className="self-center text-sm text-stone-600 underline">Effacer</Link>
      </div>
    </form>
  );
}
