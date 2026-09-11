import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { completeSignIn } from "./actions";

/**
 * The link in the sign-in email lands here. It does not consume the token on
 * GET — email security scanners open links automatically and would burn the
 * single-use token before the owner ever sees it. Consuming happens only when
 * the owner submits this confirm screen.
 */
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/admin/sign-in?error=expired");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-16">
      <h1 className="font-display text-2xl font-light">Sign in to the PSS job tracker</h1>
      <form action={completeSignIn} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="solid">Sign in</Button>
      </form>
    </div>
  );
}
