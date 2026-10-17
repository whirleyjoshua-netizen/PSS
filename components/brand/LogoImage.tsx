import Image from "next/image";

/**
 * The owner's real logo artwork (owner, 2026-10-17), in place of the vector rebuild
 * in Logo.tsx on the public site. Both files are trimmed, resized exports of the
 * supplied lockups in public/brand: logo-header.webp from lockup-light.png (for the
 * ivory header), logo-footer.webp from lockup-metallic.png, the owner's white-lettered
 * version for dark backdrops (for the charcoal footer).
 * The admin keeps the vector Logo.
 */
const ART = {
  header: { src: "/brand/logo-header.webp", width: 611, height: 168 },
  footer: { src: "/brand/logo-footer.webp", width: 780, height: 215 },
} as const;

export function LogoImage({
  variant,
  className,
  eager = false,
}: {
  variant: keyof typeof ART;
  className?: string;
  /** The header logo is above the fold on every page, so it loads straight away. */
  eager?: boolean;
}) {
  const art = ART[variant];
  return (
    <Image
      src={art.src}
      width={art.width}
      height={art.height}
      alt="Premier Shade Solutions"
      loading={eager ? "eager" : "lazy"}
      unoptimized
      className={className}
    />
  );
}
