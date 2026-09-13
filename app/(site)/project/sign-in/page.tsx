import { redirect } from "next/navigation";
import { getCustomer } from "@/lib/portal/session";
import { CustomerSignInForm } from "./SignInForm";

export default async function CustomerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCustomer()) redirect("/project");
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-6">
      <h1 className="font-display text-3xl font-light">Your project page</h1>
      <p className="text-ink-soft">
        Follow your project from quote to install. Enter the email you gave us and we&apos;ll send you a sign-in link.
      </p>
      <CustomerSignInForm expired={error === "expired"} />
    </div>
  );
}
