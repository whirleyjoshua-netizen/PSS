import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin/session";
import { SignInForm } from "./SignInForm";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getAdmin()) redirect("/admin");
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-16">
      <h1 className="font-display text-2xl font-light">PSS job tracker</h1>
      <SignInForm expired={error === "expired"} />
    </div>
  );
}
