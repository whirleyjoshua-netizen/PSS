import type { DiagramId } from "@/content/guides";
import { CellularLower, CellularPull45, CellularRaise, CellularTug } from "./cellular";
import { SlatCordUp, SlatPlugs, SlatReknot, SlatSwap } from "./slat";

/**
 * Every DiagramId maps to a drawing. A Record makes a missing id a type error,
 * and tests/guides/diagrams.test.tsx checks the keys at runtime too. The label
 * is the SVG's aria-label, so it describes the action, not the drawing.
 */
const entry = (label: string, Component: () => React.JSX.Element) => ({ label, Component });

export const DIAGRAMS: Record<DiagramId, { label: string; Component: () => React.JSX.Element }> = {
  "cellular-lower": entry("Cellular shade lowered all the way to the window sill", CellularLower),
  "cellular-pull-45": entry("Side view: the bottom rail pulled out from the window at a 45 degree angle", CellularPull45),
  "cellular-tug": entry("Side view: three short tugs on the bottom rail, held at 45 degrees", CellularTug),
  "cellular-raise": entry("Cellular shade raised and holding near the top of the window", CellularRaise),
  "slat-plugs": entry("Plugs pried out of the underside of the bottom rail", SlatPlugs),
  "slat-cord-up": entry("Lift cords pulled up through the slats to just above the broken slat", SlatCordUp),
  "slat-swap": entry("The broken slat slides out of the ladder strings and a new slat slides in", SlatSwap),
  "slat-reknot": entry("Cords threaded back through the bottom rail, knotted, and the plugs pressed back in", SlatReknot),
};

export function Diagram({ id }: { id: DiagramId }) {
  const { Component } = DIAGRAMS[id];
  return <Component />;
}
