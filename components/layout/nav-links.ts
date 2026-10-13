/**
 * The pages about us rather than a product: the desktop header's About dropdown
 * and the mobile menu both read this list, so neither can drop one.
 */
export const ABOUT_LINKS = [
  { label: "Our family", mobileLabel: "About", href: "/about" },
  { label: "Reviews", mobileLabel: "Reviews", href: "/reviews" },
  { label: "Gallery", mobileLabel: "Gallery", href: "/gallery" },
  { label: "FAQ", mobileLabel: "FAQ", href: "/faq" },
] as const;

