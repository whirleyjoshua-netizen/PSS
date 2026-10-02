# Quote options: several quotes for one job

Owner request (2026-10-02): "We need to be able to make multiple quotes for one lead. This is a very
common thing for them to see different options at their price. Within the quotes tab there should be
an add another quote option which creates a new PSS number that connects to DC and all the works just
the same." Owner choices: the client receives all sent options together and approves one; each
option's PDF can still be downloaded on its own; numbers read `PSS-1042-B`.

## 1. Today

One job = one PSS number (`leads.project_no`, printed `PSS-1042`). Every Dealer Copy whose PO
Reference is exactly that number becomes the next `version` of the job's one quote
(`dc_quote_versions`, `unique (lead_id, version)`). Send quote supersedes every other unsigned
version of the job, and `dc_quote_versions_one_offered` (migration 030) allows one offered version
per job. The portal approves "the job's offered version"; sendContract requires the version to be the
job's newest.

## 2. Model

An **option** is a letter. Option `A` is the job's own number (`PSS-1042`); option `B` is
`PSS-1042-B`, and so on to `Z`. Versions are numbered within an option.

Migration **040** (039 is claimed by feat/google-lead-webhook), `040_quote_options.sql`:

- `create table quote_options (lead_id uuid references leads(id) on delete cascade, letter text check (letter ~ '^[B-Z]$'), created_by text not null, created_at timestamptz not null default now(), primary key (lead_id, letter))`.
  Option A is never stored: every job has it.
- `alter table dc_quote_versions add column option text not null default 'A' check (option ~ '^[A-Z]$')`.
  Existing rows become option A, so every existing quote reads exactly as before.
- Replace `unique (lead_id, version)` (`dc_quote_versions_lead_id_version_key`) with
  `unique (lead_id, option, version)`. The plan confirms that constraint name on a Neon branch before relying on it.
- Replace `dc_quote_versions_one_offered` with the same deferred exclusion keyed on
  `(lead_id with =, option with =)`.
- **Re-run order:** `scripts/migrate.mjs` re-applies every file on every run, so 030 drops and re-adds
  the per-job constraint each time and 040, running after it, replaces it again. The end state is
  right only because 040 sorts after 030; 040 says so in a comment. A checkout without 040 that
  migrates prod would restore the per-job rule and break a job with two offered options (see the
  stale-worktree rule): never migrate prod from an older checkout.

`formatOptionNo(projectNo, option)` → `PSS-1042` for A, `PSS-1042-B` otherwise (20-character PO
limit: fine).

## 3. Quotes tab (admin)

One card per option, A first, each the current tab content scoped to that option: heading
`Option A · PSS-1042` (heading shown only once a job has two or more options), DC button (copies
that option's number; "Open quote … in Direct Connect" once it has a quote), Check for new quotes
(once, at the top), QuoteReview with Preview quote / Send quote, and the older versions.

Below the cards, **Add another quote**: inserts the next free letter in one statement
(`max(letter)+1`, B when none), logs a `quote` job event ("Added quote option PSS-1042-B"), and the
new card shows "No Direct Connect quote yet. Put PSS-1042-B in PO Reference …". Refused once the job
has a signed version (changes after signing are new versions of the signed option) or is Lost. Past
`Z`: refused with a message.

The Deposit panel stays once, below the cards.

## 4. Import

- `parse.ts`: PO matches `^PSS-(\d{4,})(?:-([B-Z]))?$`; the quote carries `projectNo` and `option`.
- Release gate (exact text, as today): the job is found by number and `formatOptionNo` must equal the
  printed PO; and for B–Z a `quote_options` row must exist. Otherwise `no-match`, with the usual
  owner email. A typo never creates an option.
- `latestSha` and the version number are per `(lead_id, option)`.
- The duplicate check ("unchanged") compares only to that option's newest version, and only when that
  version is not superseded or cancelled, so re-sending an unchanged Dealer Copy for a closed option
  brings it back as a new draft (needed by §6's switch).
- Job event: "Direct Connect quote 22250749 arrived as PSS-1042-B version 1" (option A keeps today's
  wording).

## 5. Sending (sendQuote)

Everything as today, scoped to the version's option: "newer version" checks, the
`version = max(version)` guard and the supersede set use `lead_id and option`. File names use the
option number: `Quote PSS-1042-B v1.pdf`, `Contract PSS-1042-B v1.pdf`; the PDF header reads
`Quote PSS-1042-B · Version 1`. `leads.quote_cents` = the total of the option just sent.

Two extra rules in the same statement:
- The supersede set also takes any **other** option's unsigned version that the client approved
  (`approved_at is not null`): sending B after the client approved A means the client is switching,
  so A closes.
- Refused if the job has a **signed** version in another option ("Option A is signed. Make changes as
  a new version of Option A.").

## 6. Client page and approval

- `offeredVersions(leadId)` replaces `offeredVersion`: every offered, not-yet-approved version whose
  quote PDF is shared, ordered by option.
- One option: the page is unchanged (the banner's Review / Approve).
- Two or more: a **Your quote options** section lists each option — `Option A`, its total, a link to
  view/download its PDF (the existing `/project/files/<id>` route) and its own Approve control. The
  banner keeps its link to the quotes but drops its single Approve button.
- The approve form carries the `versionId`; the action re-derives it from `offeredVersions` for this
  customer's job and refuses one not in that list.
- `approveDcQuote` closes the other options in the same statement: every other option's
  `draft`/`offered` version becomes `superseded`, and those versions' quote PDFs are unshared (except
  any file tied to a signature, as sendQuote does); `leads.quote_cents` becomes the approved total.
  Its event reads "Approved PSS-1042-B version 1".
- sendContract's "still the newest" guard becomes newest within the option. Signing and the deposit
  already work by version and need no change beyond their tests.
- Switching after approval: the owner re-sends that option's Dealer Copy from DC (§4 makes a new
  draft), then Send quote (§5 closes the approved option). Once signed, no switching.

## 7. Downloads

Each option's sent quote PDF is a separate shared file: the client downloads each one from the
options list or from their files; the owner from the job's Files or Preview quote per card.

## 8. Testing

- Unit: PO parsing (`PSS-1042`, `PSS-1042-B`, `PSS-1042-A` refused, `PSS-1042-b` refused, 21+ chars);
  `formatOptionNo`; the release gate with and without a `quote_options` row; per-option versioning and
  duplicate check; per-option supersede; the approved-other-option switch; the signed-other-option
  refusal; approval closing and unsharing the others; the action refusing a version not offered to
  this job. Each guard test is mutation-checked (delete the guard, watch it fail).
- Real SQL: migration 040 applied twice to a Neon test branch; a `scripts/verify-quote-options.ts`
  that runs import → add option → send A and B → approve B → contract → sign against the branch and
  checks every stored field, plus the existing verify scripts re-run.
- E2E: two options sent, the client sees both with their own PDFs, approves B, A disappears, the
  contract for B arrives.

## Out of scope

Custom option names (they read "Option A/B"), deleting an option, and comparing options line by line.
