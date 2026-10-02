/** How to put PSS Ops on an iPhone home screen. Plain steps, nothing to click here. */
export function InstallSection() {
  return (
    <section aria-labelledby="install-heading" className="flex flex-col gap-3">
      <h2 id="install-heading" className="text-lg font-semibold">
        Install on your phone
      </h2>
      <ol className="flex list-inside list-decimal flex-col divide-y divide-rule border border-rule bg-ivory text-sm">
        <li className="px-4 py-2">On the iPhone, open premiershadesolutions.com/admin in Safari.</li>
        <li className="px-4 py-2">Tap the Share button, then Add to Home Screen, then Add.</li>
        <li className="px-4 py-2">Open PSS Ops from the home screen.</li>
        <li className="px-4 py-2">
          Enter your email, type the 6-digit code from the email, then tap Turn on Face ID so next time it&apos;s one
          tap.
        </li>
      </ol>
      <p className="text-sm text-ink-soft">You stay signed in while you use it at least once every 30 days.</p>
    </section>
  );
}
