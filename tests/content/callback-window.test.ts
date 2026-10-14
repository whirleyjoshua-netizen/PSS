import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { CALLBACK_WINDOW } from "@/content/consultation";

const ROOT = path.resolve(__dirname, "../..");

/** Every source file under a folder. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Where "3 business days" means something else: the contract's cancellation window and the PDF bold-run comment. */
const OTHER_MEANINGS = ["lib/docs/starter-terms.ts", "lib/pdf/text.ts"];

describe("the callback promise", () => {
  it("is within a business day (owner 2026-10-13)", () => {
    expect(CALLBACK_WINDOW).toBe("within a business day");
  });

  it("is never the old 3 business days anywhere a visitor or lead reads it", () => {
    const offenders = ["app", "components", "content", "lib"]
      .flatMap((dir) => files(path.join(ROOT, dir)))
      .map((file) => path.relative(ROOT, file))
      .filter((file) => !OTHER_MEANINGS.includes(file))
      .filter((file) => /\b(3|three) business days\b/i.test(readFileSync(path.join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it.each(["app/(site)/thank-you/page.tsx", "app/(site)/thank-you/all-set/page.tsx", "app/(site)/contact/page.tsx", "lib/leads/email.ts"])(
    "%s quotes the shared promise",
    (file) => {
      expect(readFileSync(path.join(ROOT, file), "utf8")).toContain("CALLBACK_WINDOW");
    },
  );
});
