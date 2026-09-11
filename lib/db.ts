import { neon } from "@neondatabase/serverless";

/**
 * POSTGRES_URL is preferred over DATABASE_URL, and the order matters.
 *
 * The Neon integration sets both to the same value. DATABASE_URL is also a
 * conventional name that other projects define machine-wide, and a real
 * environment variable takes precedence over .env.local — so a developer with
 * an unrelated local Postgres can silently point this app at the wrong
 * database. POSTGRES_URL is specific enough not to collide.
 */
export function connectionString(): string {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("No database connection string (POSTGRES_URL or DATABASE_URL)");
  }
  return url;
}

export const db = () => neon(connectionString());
