import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILE = "db/migrations/034_sign_in_code.sql";
const source = readFileSync(FILE, "utf8");
const statements = source.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("migration 034", () => {
  it("never puts a semicolon inside a comment", () => {
    for (const line of source.split("\n")) if (line.trim().startsWith("--")) expect(line).not.toContain(";");
  });

  it("is re-runnable: every statement adds a column or table if missing, or drops a constraint before it adds it", () => {
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(s).toMatch(
        /^(alter table admin_login_tokens (add column if not exists|drop constraint if exists|add constraint)|create table if not exists |create index if not exists )/,
      );
    }
  });

  it("adds the code hash and the wrong-try count to the sign-in row", () => {
    expect(statements).toContain("alter table admin_login_tokens add column if not exists code_hash text");
    expect(statements).toContain(
      "alter table admin_login_tokens add column if not exists code_attempts smallint not null default 0",
    );
  });

  it("allows 0 to 5 wrong tries, dropping the check before it adds it", () => {
    const drop = statements.indexOf(
      "alter table admin_login_tokens drop constraint if exists admin_login_tokens_code_attempts_check",
    );
    const add = statements.indexOf(
      "alter table admin_login_tokens add constraint admin_login_tokens_code_attempts_check check (code_attempts between 0 and 5)",
    );
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  const table = (name: string) => statements.find((s) => s.startsWith(`create table if not exists ${name} (`)) ?? "";

  it("stores passkeys by credential id, bound to a normalized address", () => {
    const passkeys = table("admin_passkeys");
    expect(passkeys).not.toBe("");
    for (const column of [
      "id text primary key",
      "email text not null",
      "public_key bytea not null",
      "counter bigint not null default 0",
      "transports text[] not null default '{}'",
      "label text not null",
      "created_at timestamptz not null default now()",
      "last_used_at timestamptz,",
    ]) expect(passkeys).toContain(column);
    expect(passkeys).toContain("constraint admin_passkeys_email_normalized check (email = lower(btrim(email)))");
    expect(statements).toContain("create index if not exists admin_passkeys_email_idx on admin_passkeys (email)");
  });

  it("stores each Face ID challenge with its purpose, an optional address and an expiry", () => {
    const challenges = table("admin_webauthn_challenges");
    expect(challenges).not.toBe("");
    for (const column of [
      "id text primary key",
      "challenge text not null",
      "purpose text not null",
      "email text,",
      "expires_at timestamptz not null",
    ]) expect(challenges).toContain(column);
    expect(challenges).toContain(
      "constraint admin_webauthn_challenges_purpose_check check (purpose in ('register', 'sign-in'))",
    );
  });
});
