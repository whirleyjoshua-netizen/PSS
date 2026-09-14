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
3. Write down these three values — you'll paste them into Vercel in Step 4:
   - **Copy this:** the **tenant ID**
   - **Copy this:** the **client ID** (application ID)
   - **Copy this:** the **client secret value** (shown only once, right after you create it)
4. **Write down the client secret's expiry date somewhere you'll see it** (a calendar
   reminder is a good idea). When it expires, syncing will stop and the Settings page
   will show a sync error until a new secret is created and the `MS_CLIENT_SECRET`
   variable is updated.
5. **Important:** do NOT add any Graph API permissions to this app registration. Leave
   its API permissions empty. Access is granted separately, to this one mailbox only,
   in Step 3.

## Step 3: Grant access to just this mailbox (Exchange Online PowerShell)

You'll need PowerShell with the Exchange Online module, connected as an admin
(`Connect-ExchangeOnline`). Run these commands one at a time. Replace `<objectId>` with
the app registration's **Object ID** (not the client/application ID — Entra shows both;
use the Object ID of the Enterprise Application), and `<your domain>` with your real
domain.

1. Create the service principal:
   ```powershell
   New-ServicePrincipal
   ```
   (Use the Enterprise Application's App ID and Object ID when prompted, or pass them as
   parameters if you already know the exact syntax your PowerShell session expects.)

2. Create a management scope limited to the PSS Jobs mailbox:
   ```powershell
   New-ManagementScope -Name "PSS Jobs only" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'jobs@<domain>'"
   ```

3. Grant the app calendar read/write access, but only within that scope:
   ```powershell
   New-ManagementRoleAssignment -App <objectId> -Role "Application Calendars.ReadWrite" -CustomResourceScope "PSS Jobs only"
   ```

4. Confirm it worked:
   ```powershell
   Test-ServicePrincipalAuthorization -Identity <objectId> -Resource jobs@<domain>
   ```
   You should see `InScope = True`. If you see `False`, wait and try again (see next step).

5. **Wait 30 minutes to 2 hours.** Permissions like this take time to fully propagate
   through Microsoft's systems before they work reliably. Don't be alarmed if the check
   above doesn't show `InScope = True` right away — try again later.

## Step 4: Add the Vercel environment variables

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

## Step 5: Check it works

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
