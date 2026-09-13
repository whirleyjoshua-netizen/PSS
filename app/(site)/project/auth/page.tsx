import { redirect } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { completeCustomerSignIn } from "./actions";

/**
 * The emailed link lands here. Opening it does not use the token: email
 * scanners open links automatically. Only pressing Sign in does.
 */
export default async function CustomerAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/project/sign-in?error=expired");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-6">
      <h1 className="font-display text-3xl font-light">Sign in to your project page</h1>
      <form action={completeCustomerSignIn} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="solid">Sign in</Button>
      </form>
    </div>
  );
}
