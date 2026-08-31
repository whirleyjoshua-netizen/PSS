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
  const max =
    width === "wide" ? "max-w-7xl" : width === "prose" ? "max-w-2xl" : "max-w-6xl";

  return (
    <div className={`mx-auto w-full ${max} px-6 sm:px-8 ${className ?? ""}`}>
      {children}
    </div>
  );
}
