import Image from "next/image";
import type { GalleryItem } from "@/content/gallery";

type Snapshot = { photo: GalleryItem; label: string };

/**
 * Three real installs laid out like printed snapshots: white frames, a slight
 * tilt each, a strip of tape on two of them. Hovering one straightens it.
 * Fits a 22rem column and scales down to a phone.
 */
const PLACES = [
  // Large back photo, upper left.
  { frame: "left-0 top-0 z-10 w-[74%] -rotate-3", ratio: "aspect-square", tape: "left-1/2 -top-2 -translate-x-1/2 -rotate-2", sizes: "(min-width: 1024px) 17rem, 74vw" },
  // Tall photo, right.
  { frame: "right-0 top-[10%] z-20 w-[44%] rotate-3", ratio: "aspect-3/4", tape: null, sizes: "(min-width: 1024px) 10rem, 44vw" },
  // Wide front photo, bottom.
  { frame: "bottom-0 left-[6%] z-30 w-[72%] -rotate-1", ratio: "aspect-2/1", tape: "-right-3 -top-1 rotate-12", sizes: "(min-width: 1024px) 16rem, 72vw" },
] as const;

export function SnapshotCollage({ snapshots, title }: { snapshots: Snapshot[]; title: string }) {
  return (
    <figure className="flex flex-col gap-4">
      <figcaption className="font-display text-xs font-medium uppercase tracking-[0.2em] text-champagne-ink">{title}</figcaption>
      <div className="relative mx-auto aspect-3/4 w-full max-w-[22rem]">
        {snapshots.slice(0, PLACES.length).map(({ photo, label }, i) => {
          const place = PLACES[i];
          return (
            <div
              key={photo.src}
              className={`absolute bg-white p-2 pb-1 shadow-[0_10px_24px_-8px_rgba(30,30,30,0.35)] transition-transform duration-300 hover:z-40 hover:rotate-0 motion-reduce:transition-none ${place.frame}`}
            >
              {place.tape ? (
                <span aria-hidden className={`absolute z-10 h-4 w-14 bg-champagne/60 ${place.tape}`} />
              ) : null}
              <div className={`relative w-full overflow-hidden bg-sand ${place.ratio}`}>
                <Image src={photo.src} alt={photo.alt} fill sizes={place.sizes} className="object-cover" />
              </div>
              <p className="py-1 text-center font-display text-[0.7rem] tracking-wide text-ink-soft">{label}</p>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
