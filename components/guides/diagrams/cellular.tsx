import { Frame, Headrail, Label, PleatPattern, Wall, WindowPane, usePleatId } from "./parts";

function FrontView({ label, fabricHeight, fabricClass, railClass }: {
  label: string;
  fabricHeight: number;
  fabricClass: string;
  railClass: string;
}) {
  const pleat = usePleatId();
  return (
    <Frame label={label}>
      <PleatPattern id={pleat} />
      <WindowPane />
      <rect data-part="fabric" x="30" y="24" width="140" height={fabricHeight} fill={`url(#${pleat})`} className={`guide-fabric ${fabricClass}`} />
      <rect data-part="rail" x="28" y={24 + fabricHeight} width="144" height="8" rx="2" className={`fill-taupe ${railClass}`} />
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
  <FrontView label="Cellular shade lowered all the way to the window sill" fabricHeight={150} fabricClass="guide-lower-fabric" railClass="guide-lower-rail" />
);

export const CellularRaise = () => (
  <FrontView label="Cellular shade raised and holding near the top of the window" fabricHeight={45} fabricClass="guide-raise-fabric" railClass="guide-raise-rail" />
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
