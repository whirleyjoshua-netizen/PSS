# Connecting the shared Outlook calendar

This is a one-time setup so the job tracker can create, update, and read appointments
on a shared "PSS Jobs" Outlook calendar. Until you finish this, the Schedule tab still
works — it just shows a note that Outlook isn't connected yet, and reads dates straight
from the tracker.

Follow the steps in order. Each value you need to copy is marked **Copy this**.

## Step 1: Create the shared mailbox

1. In Microsoft 365 admin center, create a shared mailbox named **PSS Jobs**, for
   example `jobs@<your domain>`.
2. Give both owners Full Access to it, so its calendar shows up in your own Outlook.

## Step 2: Register the app in Entra

1. In the Entra admin center, create a new app registration:
   - Name: **PSS Tracker**
   - Supported account types: single tenant
2. Create a client secret with a **24-month** expiry.
3. Write down these three values — you'll paste them into Vercel in Step 6:
   - **Copy this:** the **tenant ID**
   - **Copy this:** the **client ID** (application ID)
   - **Copy this:** the **client secret value** (shown only once, right after you create it)
4. **Write down the client secret's expiry date somewhere you'll see it** (a calendar
   reminder is a good idea). When it expires, syncing will stop and the Settings page
   will show a sync error until a new secret is created and the `MS_CLIENT_SECRET`
   variable is updated.
5. **Important:** do NOT add any Graph API permissions to this app registration. Access
   is granted separately, to this one mailbox only, in Step 3.

   Entra adds one permission on its own, called **User.Read** (type: Delegated). That's
   normal and harmless — it doesn't mean anything went wrong. You can leave it or
   remove it.

## Step 3: Grant access to just this mailbox (Exchange Online PowerShell)

### Before you start: open PowerShell and sign in

1. Open **PowerShell** on a Windows computer. A normal window is fine — you don't need
   to "Run as administrator".
2. The first time only, install Microsoft's Exchange Online tools, just for your own
   Windows account:
   ```powershell
   Install-Module ExchangeOnlineManagement -Scope CurrentUser
   ```
   The first time you run this, PowerShell may ask two questions. Answer **Y** to both:
   - whether to install the **NuGet provider** (a small helper it needs to download tools)
   - whether to trust the **PSGallery** repository (Microsoft's official download source)
3. Every time you come back to this step, sign in (a Microsoft sign-in window opens;
   sign in as an admin):
   ```powershell
   Connect-ExchangeOnline
   ```

### Find the two IDs you need

Go to **Microsoft Entra admin center → Enterprise applications → PSS Tracker** (search
for "PSS Tracker" if it isn't listed). On its Overview page:

- **Copy this:** the **Application ID** — below it's called `<Application ID>`
- **Copy this:** the **Object ID** — below it's called `<Enterprise Object ID>`

**Important:** copy both from **Enterprise applications**, NOT from App registrations.
The App registrations page also shows an "Object ID", but it's a different number. If
you use that one, the check in item 4 will say `InScope = False` no matter how long you
wait.

### Run these commands, one at a time

In each command, replace `<Application ID>`, `<Enterprise Object ID>` and `<domain>` with
your real values (leave out the `<` and `>`).

1. Create the service principal (this tells Exchange about the app):
   ```powershell
   New-ServicePrincipal -AppId <Application ID> -ObjectId <Enterprise Object ID> -DisplayName "PSS Tracker"
   ```

2. Create a management scope limited to the PSS Jobs mailbox:
   ```powershell
   New-ManagementScope -Name "PSS Jobs only" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'jobs@<domain>'"
   ```

3. Grant the app calendar read/write access, but only within that scope:
   ```powershell
   New-ManagementRoleAssignment -App <Enterprise Object ID> -Role "Application Calendars.ReadWrite" -CustomResourceScope "PSS Jobs only"
   ```

4. Confirm it worked:
   ```powershell
   Test-ServicePrincipalAuthorization -Identity <Enterprise Object ID> -Resource jobs@<domain>
   ```
   You should see `InScope = True`.

5. **If you see `InScope = False`:** first re-check that the Object ID you used came from
   **Enterprise applications → PSS Tracker** (not App registrations). If it came from the
   wrong page, run items 1, 3 and 4 again with the right one. If the ID is right, it's
   just Microsoft being slow: permissions like this can take **30 minutes to 2 hours**
   to take effect. Wait, then run item 4 again.

## Step 4: Update the database (done by your developer / Claude)

Before any of the Outlook variables below are added to Vercel, the production database
needs the two new calendar tables. Your developer (or Claude) runs this once, against
the production database, putting the production database's address in place of
`<production database URL>`:

```
MIGRATE_DATABASE_URL=<production database URL> node scripts/migrate.mjs
```

Or, from a copy of the code whose `.env.local` file already points at the production
database, just run:

```
node scripts/migrate.mjs
```

Don't add the variables in Step 6 until this is done. If they're added first, the
Settings page will say the calendar status couldn't be read.

## Step 5: Check the site's address in Vercel

Microsoft sends calendar updates to the site's address, and it won't follow a redirect.
In the Vercel dashboard, check that the `ADMIN_BASE_URL` environment variable (production)
is exactly the site's final address:

- it starts with `https://`
- it has no `/` at the end
- it's the address that does NOT redirect. For example, if typing the bare domain in a
  browser sends you to the `www.` address, use the `www.` address.

## Step 6: Add the Vercel environment variables

In the Vercel dashboard, add these to the **production** environment. Confirm each
value with your developer before setting it, so there's no chance of a typo breaking
the connection.

| Variable | Value |
|---|---|
| `MS_TENANT_ID` | the tenant ID from Step 2 |
| `MS_CLIENT_ID` | the client ID from Step 2 |
| `MS_CLIENT_SECRET` | the client secret value from Step 2 |
| `CALENDAR_MAILBOX` | the shared mailbox address, e.g. `jobs@<your domain>` |
| `CALENDAR_CLIENT_STATE` | a random string, 32+ characters (see below) |

`CALENDAR_CLIENT_STATE` is just a secret password the tracker uses to make sure
notifications really come from Outlook. To generate one, run this on a computer with
Node.js installed and paste the result:

```
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

**Copy this:** the string it prints out — that's your `CALENDAR_CLIENT_STATE` value.

The `CRON_SECRET` variable is already set up from earlier work — you don't need to add
it again.

## Step 7: Check it works

1. Redeploy the site (or just wait for the next deploy) so the new environment
   variables take effect.
2. In the Vercel dashboard, go to the project's **Cron Jobs** page and find the
   calendar cron job. Click **Run** to trigger it once by hand.
3. Open the job tracker, set a visit date/time on a test job, and check the PSS Jobs
   calendar in Outlook — the appointment should show up within a minute.
4. In Outlook, move that appointment to a different time, and check the test job in
   the tracker — its visit time should update within a few minutes.
5. Clear the visit date on the test job (or delete the test job) so it doesn't linger
   on the shared calendar.

Once all of that works, the Settings page in the admin app will show "Connected" along
with when updates from Outlook are switched on — that's your confirmation everything is
wired up correctly.
