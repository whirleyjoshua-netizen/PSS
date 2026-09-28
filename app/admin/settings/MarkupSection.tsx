"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { formatCents } from "@/lib/admin/money";
import { sellUnitCents } from "@/lib/dc/money";
import { saveMarkupAction, type MarkupState } from "./actions";

const CONTROL = "min-h-11 w-24 border border-rule bg-ivory px-3 py-2";

/** The example every row prices, so the owner sees what a percentage means in dollars. */
const EXAMPLE_MSRP_CENTS = 65500;

function Row({ collection, pct }: { collection: string; pct: number | null }) {
  const [state, action, saving] = useActionState<MarkupState, FormData>(saveMarkupAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 border-b border-rule py-2">
      <input type="hidden" name="collection" value={collection} />
      <span className="min-w-48 flex-1">{collection}</span>
      <label className="flex items-center gap-2">
        <input name="pct" defaultValue={pct ?? ""} inputMode="decimal" aria-label={`${collection} % of MSRP`} className={CONTROL} />
        <span>% of MSRP</span>
      </label>
      <Button type="submit" disabled={saving}>
        Save
      </Button>
      <span className="w-full text-sm text-ink-soft">
        {pct === null
          ? "Not set. Quotes with this product can't be sent yet."
          : `A ${formatCents(EXAMPLE_MSRP_CENTS)} MSRP sells for ${formatCents(sellUnitCents(EXAMPLE_MSRP_CENTS, pct))}.`}
      </span>
      {state.error ? (
        <p role="alert" className="text-sm text-overdue">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm text-ink-soft">
          Saved.
        </p>
      ) : null}
    </form>
  );
}

/** A starting percentage for a product line no quote has used yet. */
function AddLine() {
  const [state, action, saving] = useActionState<MarkupState, FormData>(saveMarkupAction, {});
  return (
    <form action={action} aria-labelledby="markup-add-heading" className="flex flex-col gap-2 pt-2">
      <h3 id="markup-add-heading" className="font-semibold">
        Add a product line
      </h3>
      <input type="hidden" name="mode" value="add" />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span>Product line</span>
          <input name="collection" className="min-h-11 w-full border border-rule bg-ivory px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span>% of MSRP</span>
          <input name="pct" inputMode="decimal" className={CONTROL} />
        </label>
        <Button type="submit" disabled={saving}>
          Add product line
        </Button>
      </div>
      <p className="text-sm text-ink-soft">
        Type it exactly as Direct Connect&apos;s &quot;Collection&quot; shows it, for example Alta Honeycomb Shades.
        Capital letters don&apos;t matter.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-overdue">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm text-ink-soft">
          Added.
        </p>
      ) : null}
    </form>
  );
}

/** Each product line's markup over Hunter Douglas MSRP. Lines appear once a quote uses them or the owner adds one. */
export function MarkupSection({ collections, rules }: { collections: string[]; rules: Record<string, number> }) {
  return (
    <section aria-labelledby="markup-heading" className="flex flex-col gap-2">
      <h2 id="markup-heading" className="text-lg font-semibold">
        Markup by product line
      </h2>
      <p className="text-sm text-ink-soft">
        What the client pays, as a percentage of Hunter Douglas MSRP. Product lines appear here once a Direct Connect
        quote uses them, or when you add one.
      </p>
      {collections.length === 0 ? (
        <p className="text-ink-soft">
          No product lines yet. Add one below, or they appear once a Direct Connect quote uses them.
        </p>
      ) : null}
      {collections.map((c) => (
        <Row key={c} collection={c} pct={rules[c] ?? null} />
      ))}
      <AddLine />
    </section>
  );
}
