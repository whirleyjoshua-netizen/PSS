import { formatCents } from "@/lib/admin/money";

/**
 * What the client contract shows. Deliberately client prices only: no cost, MSRP, cost
 * factor, markup percentage or DC quote number has a field here, so none can be drawn.
 */
export type ContractInput = {
  projectNo: string; version: number; date: Date;
  client: { name: string; address: string | null; city: string; email: string | null };
  lines: { room: string; description: string; options: [string, string][]; qty: number; sellUnitCents: number; sellExtendedCents: number }[];
  installCents: number; handlingChargedCents: number; oversizedCents: number; clientTotalCents: number;
};
export type ContractRow = { room: string; product: string; details: string; qty: string; unit: string; total: string };

const TYPOGRAPHIC: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"', "″": '"', "′": "'",
  "–": "-", "—": "-", "…": "...", " ": " ", " ": " ",
};

/** Text pdf-lib's standard (WinAnsi) fonts can draw: Latin-1 kept, typographic marks mapped, the rest "?". */
export function winAnsiSafe(text: string): string {
  return [...text].map((ch) => TYPOGRAPHIC[ch] ?? (/[\x20-\x7e\xa1-\xff]/.test(ch) ? ch : "?")).join("");
}

/** The details a client recognises: size, mount, fabric and color, control. Everything else stays in DC. */
export function keyDetails(options: [string, string][]): string {
  const get = (label: string) => options.find(([l]) => l === label)?.[1] ?? "";
  const width = get("Order Width");
  const height = get("Order Height");
  const size = width && height ? `${width}" W x ${height}" H` : "";
  const fabric = [get("Fabric Type"), get("Color")].filter(Boolean).join(", ");
  return [size, get("Mount Type"), fabric, get("Control System")].filter(Boolean).join(" · ");
}

export function contractRows(input: ContractInput): { rows: ContractRow[]; totals: [string, string][] } {
  const rows: ContractRow[] = input.lines.map((line) => ({
    room: line.room || "Accessory",
    product: line.description.replace(/^Hunter Douglas\s+/, ""),
    details: keyDetails(line.options),
    qty: String(line.qty),
    unit: formatCents(line.sellUnitCents),
    total: formatCents(line.sellExtendedCents),
  }));
  const totals: [string, string][] = [];
  if (input.installCents > 0) totals.push(["Installation", formatCents(input.installCents)]);
  if (input.handlingChargedCents > 0) totals.push(["Hunter Douglas handling", formatCents(input.handlingChargedCents)]);
  if (input.oversizedCents > 0) totals.push(["Oversize charge", formatCents(input.oversizedCents)]);
  totals.push(["Total", formatCents(input.clientTotalCents)]);
  return { rows, totals };
}
