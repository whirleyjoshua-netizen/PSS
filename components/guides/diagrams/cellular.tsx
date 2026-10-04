import { Frame, Headrail, Label, PleatPattern, Wall, WindowPane, usePleatId } from "./parts";

/**
 * The fabric is always drawn full length (24→174). A raised pose wraps it in
 * an outer <g transform> that squashes it, so its pleats stack, while the CSS
 * animation on the inner rect starts it at full length.
 */
function FrontView({ label, pose, railY, fabricClass, railClass }: {
  label: string;
  pose?: { part: string; transform: string };
  railY: number;
  fabricClass: string;
  railClass: string;
}) {
  const pleat = usePleatId();
  const fabric = (
    <rect data-part="fabric" x="30" y="24" width="140" height="150" fill={`url(#${pleat})`} className={`guide-fabric ${fabricClass}`} />
  );
  return (
    <Frame label={label}>
      <PleatPattern id={pleat} />
      <WindowPane />
      {pose ? <g data-part={pose.part} transform={pose.transform}>{fabric}</g> : fabric}
      <rect data-part="rail" x="28" y={railY} width="144" height="8" rx="2" className={`fill-taupe ${railClass}`} />
      <Headrail x={26} y={14} width={148} />
    </Frame>
  );
}

function SideView({ label, motionClass, children }: { label: string; motionClass: string; children?: React.ReactNode }) {
  const pleat = usePleatId();
  return (
    <Frame label={label}>
      <PleatPattern id={pleat} />
      <Wall />
      {children}
      <g data-part="pose" transform="rotate(-45 62 24)">
        <g className={`guide-swing ${motionClass}`}>
          <rect data-part="fabric" x="58" y="24" width="8" height="150" fill={`url(#${pleat})`} />
          <rect x="55" y="172" width="14" height="8" rx="2" className="fill-taupe" />
        </g>
      </g>
      <Headrail x={50} y={14} width={22} />
    </Frame>
  );
}

export const CellularLower = () => (
  <FrontView label="Cellular shade lowered all the way to the window sill" railY={174} fabricClass="guide-lower-fabric" railClass="guide-lower-rail" />
);

export const CellularRaise = () => (
  <FrontView
    label="Cellular shade raised and holding halfway down the window"
    // y' = 0.5y + 12: the fabric's top stays at 24 and its bottom (174) lands at 99, halfway.
    pose={{ part: "raise-pose", transform: "matrix(1 0 0 0.5 0 12)" }}
    railY={99}
    fabricClass="guide-raise-fabric"
    railClass="guide-raise-rail"
  />
);

export const CellularPull45 = () => (
  <SideView label="Side view: the bottom rail pulled out from the window at a 45 degree angle" motionClass="guide-pull">
    <path d="M62 180 A156 156 0 0 0 172 134" fill="none" className="stroke-champagne-ink" strokeWidth="1.5" strokeDasharray="4 4" />
    <Label x={126} y={184}>45°</Label>
  </SideView>
);

export const CellularTug = () => (
  <SideView label="Side view: three short tugs on the bottom rail, held at 45 degrees" motionClass="guide-tug">
    <Label x={110} y={188}>3 short tugs</Label>
  </SideView>
);
