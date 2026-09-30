# Visible signatures and initials — design

Date: 2026-09-29. Owner-approved in conversation the same day.

## 1. What and why

Today a client signs by typing their full name and ticking "I agree to sign electronically". The
signed copy gets one extra page, "ELECTRONIC SIGNATURE", with the typed name, email, time and the
document's SHA-256. Nothing appears on the contract's own pages, so a signed contract does not
look signed.

The owner wants every signed document to look signed:

- a **signature block** at the end with the client's signature, printed name and date;
- the client's **initials beside every numbered section** of the document (e.g. "4. Your Right
  to Cancel");
- the client chooses to **draw** (finger or mouse) or **type** (shown in a handwriting font);
- the client **adopts initials once** and they are applied to every numbered section.

Scope: **every signed document** — Direct Connect contracts and job documents with response
"sign" (service agreement, change order). A document with no numbered sections gets the
signature block only.

## 2. Terms

- **Numbered section**: a doc-text heading (`##` or `###`) whose text starts with a number and a
  period, e.g. `## 4. Your Right to Cancel` (regex `^\d+\.\s`). Only doc text we render has them;
  an uploaded PDF has none we can find.
- **Sign marks**: where, on the generated PDF, the initials and the signature block belong:
  `{ initials: { page, x, y }[], signature: { page, x, y } | null }` in PDF points, page 0-based.
- **Adoption**: what the client chose — method (`typed` | `drawn`), their signature and their
  initials (typed text, or a PNG each when drawn).

## 3. The unsigned PDF (what is sent)

Generated PDFs gain visible, empty places to sign, so the client sees where their marks go:

- Each numbered-section heading is wrapped 64pt narrower and gets a small "Initials ______"
  box at the right margin, level with the heading's first line.
- The document ends with a **signature block** on the page it fits on (a new page if needed):
  "Client signature ______________", "Printed name ______________", "Date ________".
  - DC contract, terms from the template: after the terms.
  - DC contract, legacy uploaded terms PDF: a final page after the copied pages, drawn by us.
  - Job document (sign): replaces today's SIGN_CLOSING line.
  - Acknowledge and view documents are unchanged (no initials, no block).
- The renderer records the sign marks while it draws; the builder returns them with the bytes.
- The marks are stored with the file when the PDF is created: new nullable column
  `job_files.sign_marks jsonb`, written in the same statement that creates the file (DC send and
  the document send both go through `createFile`, which gains an optional `signMarks`).

A file with no marks — hand-uploaded contracts, and anything generated before this ships — is
signed exactly as today, plus the adoption on the signature page (section 5).

## 4. Signing on the portal

The existing sign form (`SignContract.tsx`) becomes, inside the same closed `<details>`:

1. **Adopt your signature**, with a **Type | Draw** switch. Type is the default.
   - Type: "Your full name" (as today) and "Your initials" (1–6 letters). A live preview shows
     both in the handwriting font.
   - Draw: a signature pad and a smaller initials pad (pointer events; finger, pen or mouse),
     each with Clear. Drawn strokes become a PNG (transparent background, max 600×200 and 200×100
     CSS px at device pixel ratio ≤ 2). "Your full name" is still typed, for the printed name
     and the record.
2. One checkbox: "I agree to sign this {noun} electronically" — plus " and to initial every
   numbered section" when the file has initial marks.
3. **Sign this {noun}**.

Initials are required only when the file has initial marks. Typed mode works with JavaScript
off (plain form post, as today); Draw needs JavaScript and is hidden without it.

## 5. The signed copy

`stampSignature` takes the adoption and the file's sign marks:

- With marks: on a copy of the original, draw the initials (typed text in the handwriting font,
  or the PNG scaled into the box) at every initials mark, and the signature, printed name and
  date into the signature block. Nothing else on the page changes.
- Always: the "ELECTRONIC SIGNATURE" page at the end, as today, now also showing the adopted
  signature and initials, the method ("typed" / "drawn"), and "Initialed sections: 4, 5, …"
  (or "No numbered sections").
- The original file and its SHA-256 are untouched; the client signs the original bytes, exactly
  as today. The stamped copy remains a convenience copy; the record carries the weight.

## 6. What is stored

Migration (next free number, claimed with any parallel session before writing):

- `job_files.sign_marks jsonb` (nullable).
- `contract_signatures` gains `signature_method text` check in ('typed','drawn'),
  `signed_initials text` (typed initials; null when drawn), `signature_image_pathname text`,
  `initials_image_pathname text` (private Blob, drawn only). Existing rows: method null, meaning
  "signed before adoption existed".

`recordSignature` writes the adoption in its existing single statement. Drawn PNGs are validated
and stored in private Blob **before** that statement (`jobs/<jobId>/signatures/<uuid>-*.png`);
if the statement then writes nothing (already signed, not found), they are deleted.

Validation (server, in the action): method is typed or drawn; typed initials match
`^[A-Za-z][A-Za-z.\- ]{0,5}$` after trim; a drawn image is a data URL of a real PNG (magic bytes),
≤ 150 KB decoded, width ≤ 1200 and height ≤ 400 px; initials present exactly when the file has
initial marks. Anything else is "invalid" and nothing is stored.

## 7. Handwriting font

One OFL-licensed script font (e.g. Dancing Script), TTF committed under `lib/pdf/fonts/` with
its licence, embedded with `@pdf-lib/fontkit` (new dependency). The portal preview uses the same
font via `next/font/local`. Characters the font cannot draw fall back to Helvetica Oblique.

## 8. Emails and screens

- Owner and client emails are unchanged apart from attaching the stamped copy as today.
- The Files and Documents tabs link the signed copy as today.

## 9. Security

- Everything is re-derived from the session, as today; the file's marks are read from the
  database, never from the form.
- Images are private Blob, served only through the existing authorised file routes.
- Size and type limits above; no image is decoded beyond reading its PNG header dimensions.

## 10. Testing

- Unit: numbered-section detection; marks recorded by the renderer (page, x, y for each numbered
  heading, including across page breaks) and by both builders; stamp draws at every mark (text
  and PNG) and on the signature page; no marks → today's behaviour plus the adoption; action
  validation (each rule, with power checks).
- Real DB: the migration twice on the Neon test branch; the new recordSignature columns and the
  sign_marks write proved against it.
- e2e: a DC contract signed typed and a service agreement signed drawn (Playwright draws on the
  canvas), both asserting via `pdfText` that the initials appear once per numbered section and
  the signature block is filled.

## 11. Out of scope

- Initialing uploaded terms PDFs (no sections we can find).
- Re-stamping documents signed before this ships.
- Per-section tap-to-initial (the owner chose adopt-once).
