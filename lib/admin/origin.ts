import { business } from "@/content/business";

/** Where owner links point. From configuration, never the request's Host. No trailing slash. */
export const adminOrigin = (): string => (process.env.ADMIN_BASE_URL || business.domain).replace(/\/+$/, "");
