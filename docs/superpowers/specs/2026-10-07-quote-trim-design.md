# Quote without the product details line — design

Owner request (2026-10-07), from Quote PSS-1016-D v2: the quote that wins the client should carry less product
information. Everything can stay on the contract.

## Decision

- **Quote PDF** (sent and Preview): each line shows room, product name, qty, each and total only. The details line
  under the product (size · mount · fabric/color · control, from `keyDetails`) is not drawn. Heading, client block,
  totals and closing sentence are unchanged.
- **Contract PDF:** unchanged, details line kept.
- **Unchanged:** the admin Quote tab review table (still shows `keyDetails`), quotes already sent (stored PDFs),
  every figure. No migration.

## How

`drawPricedPages` (lib/dc/contract-pdf.ts) takes a required `{ details: boolean }`. The contract passes `true`, the
quote `false`. One shared builder stays, so the quote and contract cannot drift on figures. Without details a row is
one line tall, so the quote is more compact and line positions no longer match the contract's page 1.

## Tests

- Quote PDF draws none of the details text; the contract still draws it.
- Every other string the quote draws (rooms, products, qty, money, totals) is drawn by the contract's page 1 too, and
  the only contract page-1 strings the quote lacks are the heading, the closing sentence and the details lines.
- Mutation check: passing `details: true` for the quote turns the quote test red.
