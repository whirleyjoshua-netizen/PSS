import Link from "next/link";

export default function JobNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-16">
      <h1 className="font-display text-2xl font-light">No job with that link</h1>
      <Link href="/admin" className="underline underline-offset-4">Back to all jobs</Link>
    </div>
  );
}
