import { Frame, Headrail, Label } from "./parts";

const SLAT_YS = [30, 44, 58, 72, 86, 100, 114, 128, 142];
const BROKEN_Y = 86;
const CORD_XS = [66, 134];
const PLUG_XS = [62, 130];

function Blind({ cordEnd, cordClass, broken = true, children }: {
  /** Where the lift cords end; 168 is threaded all the way into the bottom rail. */
  cordEnd: number;
  cordClass?: string;
  broken?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <>
      {[60, 140].map((x) => (
        <line key={x} x1={x} y1="24" x2={x} y2="158" className="stroke-taupe" strokeWidth="1" />
      ))}
      {SLAT_YS.filter((y) => !(y === BROKEN_Y && !broken)).map((y) => (
        <rect key={y} x="32" y={y} width="136" height="6" rx="1" className="fill-champagne" />
      ))}
      {broken ? <path d={`M96 ${BROKEN_Y} l4 3 l-3 3`} fill="none" className="stroke-charcoal" strokeWidth="1.5" /> : null}
      {CORD_XS.map((x) => (
        <line key={x} data-part="cord" x1={x} y1="24" x2={x} y2={cordEnd} className={`stroke-charcoal ${cordClass ?? ""}`} strokeWidth="1.2" />
      ))}
      <rect x="30" y="158" width="140" height="10" rx="2" className="fill-taupe" />
      <Headrail x={30} y={14} width={140} />
      {children}
    </>
  );
}

function Plugs({ y, motionClass }: { y: number; motionClass: string }) {
  return (
    <>
      {PLUG_XS.map((x) => (
        <rect key={x} data-part="plug" x={x} y={y} width="8" height="5" className={`fill-charcoal ${motionClass}`} />
      ))}
    </>
  );
}

export const SlatPlugs = () => (
  <Frame label="Plugs pried out of the underside of the bottom rail">
    <Blind cordEnd={168}>
      <Plugs y={182} motionClass="guide-plug-out" />
      <Label x={80} y={196}>plugs</Label>
    </Blind>
  </Frame>
);

export const SlatCordUp = () => (
  <Frame label="Lift cords pulled up through the slats to just above the broken slat">
    <Blind cordEnd={80} cordClass="guide-cord-up">
      <Label x={72} y={186}>pull cords up</Label>
    </Blind>
  </Frame>
);

export const SlatSwap = () => (
  <Frame label="The broken slat slides out of the ladder strings and a new slat slides in">
    <Blind cordEnd={80} broken={false}>
      <rect data-part="old-slat" x="32" y={BROKEN_Y} width="136" height="6" rx="1" opacity="0" className="fill-champagne guide-slat-out" />
      <rect data-part="new-slat" x="32" y={BROKEN_Y} width="136" height="6" rx="1" className="fill-champagne guide-slat-in" />
      <Label x={62} y={186}>slide out, slide in</Label>
    </Blind>
  </Frame>
);

export const SlatReknot = () => (
  <Frame label="Cords threaded back through the bottom rail, knotted, and the plugs pressed back in">
    <Blind cordEnd={168} broken={false} cordClass="guide-rethread">
      {CORD_XS.map((x) => (
        <circle key={x} data-part="knot" cx={x} cy="163" r="3" className="fill-champagne-ink guide-knot" />
      ))}
      <Plugs y={168} motionClass="guide-plug-in" />
      <Label x={70} y={190}>knot, plug in</Label>
    </Blind>
  </Frame>
);
