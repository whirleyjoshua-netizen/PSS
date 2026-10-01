/**
 * Stands in where a page has no real photo of the product yet (spec 2026-10-01 §6):
 * a sand block with a faint woven texture and the name in light serif lettering.
 * Decorative — the card or section beside it already says the name in text.
 */
export function FabricPanel({ label, className }: { label: string; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-sand bg-[repeating-linear-gradient(45deg,var(--color-rule)_0_1px,transparent_1px_7px),repeating-linear-gradient(-45deg,var(--color-rule)_0_1px,transparent_1px_7px)] p-6 text-center ${className ?? ""}`}
    >
      <span className="heading-serif text-2xl text-taupe">{label}</span>
    </div>
  );
}
