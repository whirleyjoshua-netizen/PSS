# Setting up route planning

This is a one-time setup so the Schedule tab can show jobs on a map and plan each
installer's route for the day. It uses three Google services: the map itself, address
lookup (turning a typed address into a spot on the map), and Google's route planner.

Until you finish this, everything else still works. Booking, emails and the week view
are not affected. The Route view just says route planning isn't set up yet.

**Settings → Routes** shows three lines, one for each piece: **Route planning**,
**Map** and **Address lookup**. Each one says "is connected." or "is not set up yet."
It only ever says whether a piece is set up. It never shows the keys themselves.

Follow the steps in order. Each value you need to copy is marked **Copy this**.

## Step 1: Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a
   project (for example **PSS Routes**), or choose one you already have.
2. Turn on **billing** for the project. Google needs a card on file, but normal use
   should stay within Google's free monthly usage for each product.
3. In **Billing → Budgets & alerts**, set a budget alert at **$10**, so you get an email
   if the cost ever climbs.
4. In **APIs & Services → Library**, search for and **Enable** each of these:
   - **Maps JavaScript API** (draws the map)
   - **Geocoding API** (address lookup)
   - **Route Optimization API** (plans the routes)

   Optional: to put a hard cap on route planning, open **APIs & Services → Route
   Optimization API → Quotas** and lower the requests-per-day limit (for example to
   **200**). Once the cap is reached, Build routes shows an error until the next day.
5. **Copy this:** the **Project ID** from the project dashboard (it looks like
   `pss-routes-123456`). This is `GOOGLE_CLOUD_PROJECT_ID`.

## Step 2: Browser key (for the map)

This key is visible to web browsers, so it's locked to your website.

1. **APIs & Services → Credentials → Create credentials → API key.**
2. Click the new key to edit it. Name it **PSS map (browser)**.
3. Under **Application restrictions**, pick **Websites** and add both of these:
   - `https://premiershadesolutions.com`
   - `https://premiershadesolutions.com/*`

   Use the same address as the site's `ADMIN_BASE_URL` setting in Vercel (the address
   the sign-in links use). The `www.` address just redirects to this one, so you don't
   need to add it.
   If the site ever moves to another address, add that one here too.
4. Under **API restrictions**, pick **Restrict key** and tick only **Maps JavaScript API**.
5. Save. **Copy this:** the key. This is `NEXT_PUBLIC_GOOGLE_MAPS_KEY`.

## Step 3: Map ID

The numbered, coloured pins need a Map ID.

1. Go to **Google Maps Platform → Map management**
   ([direct link](https://console.cloud.google.com/google/maps-apis/studio/maps)) and
   click **Create Map ID**.
2. Name: **PSS Routes**. Map type: **JavaScript**. Choose **Vector**.
3. Save. **Copy this:** the **Map ID**. This is `NEXT_PUBLIC_GOOGLE_MAP_ID`.

## Step 4: Server key (for address lookup)

This second key is only used by the website's server, never shown in a browser.

1. **Credentials → Create credentials → API key.** Name it **PSS geocoding (server)**.
2. **Application restrictions:** leave as **None**. (Vercel's servers don't have fixed
   addresses, so the key can't be locked to one.)
3. **API restrictions:** **Restrict key**, tick only **Geocoding API**.
4. Save. **Copy this:** the key. This is `GOOGLE_GEOCODING_KEY`.

## Step 5: Service account (for the route planner)

The route planner doesn't use a key. It signs in as a "service account", a robot
user that can only plan routes.

1. **IAM & Admin → Service accounts → Create service account.**
   - Name: **pss-routes**
2. When asked for a role, choose **Route Optimization Editor**
   (`roles/routeoptimization.editor`). Give it no other roles.
3. Finish, then open **pss-routes → Keys → Add key → Create new key → JSON.** A file
   downloads.
4. **Copy this:** open the file in Notepad and copy **everything** in it, from the
   first `{` to the last `}`. This whole text is `GOOGLE_SERVICE_ACCOUNT_JSON`.
5. Treat that file like a password. Once it's in Vercel, delete it from your computer.

## Step 6: Add the Vercel environment variables

Add these five to the **production** environment. You can use the Vercel dashboard, or
run this once for each name and paste the value when asked:

```
npx vercel env add <NAME> production
```

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | the browser key from Step 2 |
| `NEXT_PUBLIC_GOOGLE_MAP_ID` | the Map ID from Step 3 |
| `GOOGLE_GEOCODING_KEY` | the server key from Step 4 |
| `GOOGLE_CLOUD_PROJECT_ID` | the Project ID from Step 1 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the whole JSON file's text from Step 5, pasted as one value |

The two `NEXT_PUBLIC_` values are baked in when the site is built, so the site must be
deployed again after adding them (Step 7 does this).

**Never add `ROUTE_OPTIMIZATION_URL` or `ROUTE_OPTIMIZATION_TOKEN` to Vercel.** They are
for automated tests on a developer's own computer only. The site ignores them unless
they point at that computer, and they would never reach Google.

## Step 7: Update the database and deploy (done by your developer / Claude)

Do these in this order, after Step 6:

1. Before running anything, check the database address. This prints only its host and
   changes nothing:
   ```
   node -e "console.log(new URL(process.argv[1]).host)" "<production database URL>"
   ```
   Confirm it prints the production host. If it doesn't, stop and find the right URL.
   Use this same URL in items 2 and 4.
2. Update the production database (adds the map and route columns, migration 017):
   ```
   MIGRATE_DATABASE_URL=<production database URL> node scripts/migrate.mjs
   ```
   Or, from a copy of the code whose `.env.local` already points at production, just
   `node scripts/migrate.mjs`. In that case, check the `DATABASE_URL` from `.env.local` in item 1.
   Its first line shows which database it used. That line appears after the script has
   started, so it can't stop the writes. It's a second check that the right database was used.
3. Deploy. Pushing to GitHub does **not** deploy this site. Run:
   ```
   npx vercel --prod
   ```
   Then open the live site and check it loads.
4. Place every existing job on the map, once:
   ```
   MIGRATE_DATABASE_URL=<production database URL> node scripts/geocode-backfill.mjs
   ```
   Its first line shows which database it used. That line appears after the script has
   started, so it can't stop the writes. It's a second check that the right database was used.
   Use the same production database URL you checked in item 1. The script needs
   `GOOGLE_GEOCODING_KEY` in `.env.local` or the environment. Note the ok / not found /
   error counts it prints. Running it again only touches jobs it hasn't done yet.
5. Open **Settings → Routes**. All three lines should say "is connected." Check the
   working day and appointment lengths are right.

## Step 8: Check it works on the live site

Do every item. Use a real day with at least three appointments and two installers.

- [ ] **Settings → Routes** says Route planning, Map and Address lookup are all connected.
- [ ] **Pins appear.** Open **Schedule → Route** for that day. The map shows a grey pin
      for each appointment before you build anything.
- [ ] **Build on a real day.** Tick the installers and click **Build routes**. Within
      about 15 seconds each installer gets coloured numbered pins, a line along the
      roads, arrival times and drive minutes. Every promised arrival window is met, or
      the job is listed under **Didn't fit** with a reason.
- [ ] **Move and recheck.** Move one stop to the other installer, and move another stop
      up one place. The times refresh. Any stop that now breaks its window shows
      **Misses its window**.
- [ ] **Save.** Click **Save routes**. The moved job's page shows the new installer,
      and its Activity says "Assigned to … (Installer) by route".
- [ ] **Week view.** Go to **Schedule → Week**. Those appointment cards show
      **Route:** and the planned arrival time.
- [ ] **Out of date.** Reschedule one of those appointments. The Route view now says
      **Route is out of date — rebuild**.
- [ ] **Google Maps link.** On a phone, open the Route view (the map sits above the
      lists). Tap **Open in Google Maps** for an installer. The Maps app opens with
      every stop in the same order as the list.
- [ ] **Confirmation email shows the window.** On a test job, book an install with an
      arrival window of 8:00 to 10:00 and send the confirmation to an owner's own email
      address. The email says "We'll arrive between 8:00 and 10:00 am."
- [ ] **Needs address.** Take a job whose address can't be found (it's listed under
      **Needs address** on the Route view). Click its name, fix the address on the job
      page and save. Within a minute, reload the Route view: the job is gone from
      **Needs address** and has a pin. The address on the job is still exactly as you
      typed it (Google never rewrites it).
- [ ] In the Vercel logs, there are no "Route planning failed" or "Geocoding failed"
      errors from the check.
- [ ] In Google Cloud, **Billing → Reports** shows the check's cost is inside the free
      credit.

Clean up any test bookings afterwards so they don't go to installers.

## If something isn't working

- **A line in Settings says "not set up yet":** the matching variable is missing from
  Vercel production, or the site wasn't deployed again after adding it.
  - Map → `NEXT_PUBLIC_GOOGLE_MAPS_KEY` and `NEXT_PUBLIC_GOOGLE_MAP_ID`
  - Address lookup → `GOOGLE_GEOCODING_KEY`
  - Route planning → `GOOGLE_CLOUD_PROJECT_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON`
- **The map is blank or says "For development purposes only":** billing is off, the
  Maps JavaScript API isn't enabled, or the browser key's website address doesn't match
  the site's address exactly.
- **Build routes shows an error:** check the Route Optimization API is enabled and the
  service account has the Route Optimization Editor role. Booking still works meanwhile.

## For developers: running the route test

The automated route test (`e2e/routes.spec.ts`) writes to a database, so it only runs
against a **Neon test branch**, never production. It uses a fake route planner on this
computer, so it never calls Google.

1. Create a branch of the database in Neon and copy its connection string.
2. Apply migrations to that branch:
   `MIGRATE_DATABASE_URL=<branch URL> node scripts/migrate.mjs`.
3. Run the test, setting `E2E_DB_HOST_ALLOW` to part of the branch's host (for example
   its endpoint id, `ep-...`). The test refuses to run if the database address doesn't
   contain it, as a guard against pointing it at production:
   ```
   E2E_POSTGRES_URL=<branch URL> E2E_DB_HOST_ALLOW=<endpoint id> npx playwright test e2e/routes.spec.ts
   ```
   It builds the site and runs it with `next start` on 127.0.0.1.
4. Delete the branch when you're done.
