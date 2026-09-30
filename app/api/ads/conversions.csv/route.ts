// Google Data Manager's HTTPS source expects the address to end in a file name (….csv), so the
// feed also answers here. Same handler, same Basic auth, same rows as /api/ads/conversions.
// `dynamic` is declared here, not re-exported: Next reads route config from each file itself.
export { GET } from "../conversions/route";
export const dynamic = "force-dynamic";
