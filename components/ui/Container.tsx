export function Container({
  children,
  className,
  width = "default",
}: {
  children: React.ReactNode;
  className?: string;
  /** "prose" keeps running text near 65 characters for readability. */
  width?: "default" | "wide" | "prose";
}) {
  /**
   * The default runs to 1440px so grids, cards, and heroes use the width of a
   * large monitor. Long-form text does NOT inherit that width — prose columns
   * carry their own max-width, because a paragraph measured much past ~75
   * characters is measurably harder to read: the eye loses its place on the
   * return sweep to the next line.
   */
  const max =
    width === "wide"
      ? "max-w-[104rem]"
      : width === "prose"
        ? "max-w-2xl"
        : "max-w-[90rem]";

  return (
    <div className={`mx-auto w-full ${max} px-6 sm:px-8 ${className ?? ""}`}>
      {children}
    </div>
  );
}
