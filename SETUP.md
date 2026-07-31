# TeraKira consultation form setup

## 1. Copy these files into the project root

- `api/consultation.js`
- `api/cleanup.js`
- `js/consultation-form.js`
- `package.json`
- `vercel.json`

Merge the loader code from `js/pages-consultation-loader.js` into the existing `js/pages.js`.

Add this before `js/pages.js` on every page that loads the form:

```html
<script src="js/consultation-form.js" defer></script>
<script src="js/pages.js" defer></script>
```

Apply the HTML snippets in `component/consultation-form-additions.html` to the existing form and merge `component/consultation-form-extra.css` into the relevant stylesheet.

## 2. Create and connect Neon

In Vercel, open the project and add a Neon integration from the Storage/Marketplace area. Ensure it creates a `DATABASE_URL` environment variable for Production, Preview and Development as needed.

Open the Neon SQL editor and run `sql/schema.sql`.

## 3. Configure Cloudflare Turnstile

Create a Turnstile widget for the deployed hostname and local test hostname if needed.

- Put the public site key in `data-sitekey` inside `consultation-form.html`.
- Add the secret key to Vercel as `TURNSTILE_SECRET_KEY`.

Do not put the secret key in HTML or JavaScript.

## 4. Configure Resend

Create a Resend API key with sending access. Add these Vercel environment variables:

```text
RESEND_API_KEY=re_...
ADMIN_NOTIFICATION_EMAIL=dnyal1421@gmail.com
RESEND_FROM_EMAIL=TeraKira <onboarding@resend.dev>
```

During Resend testing, the receiving address generally needs to match the email associated with the Resend account. After verifying the TeraKira domain, change `RESEND_FROM_EMAIL` to an address on that domain and add the customer confirmation email inside `api/consultation.js`.

## 5. Configure cleanup authorization

Generate a long random value and add it to Vercel:

```text
CRON_SECRET=a-long-random-secret
```

The daily cron runs at 03:00 UTC. It clears IP address and User-Agent after 30 days and deletes full submissions after 2 years.

## 6. Deploy

Commit and push the files to GitHub. Vercel will install the dependencies and redeploy.

Test these cases:

1. Valid submission saves in Neon and sends the admin email.
2. Required fields block submission.
3. Turnstile failure is rejected.
4. A fourth submission from one IP within one hour receives HTTP 429.
5. Email failure still shows success after the database insert.

## Environment variables summary

```text
DATABASE_URL=
TURNSTILE_SECRET_KEY=
RESEND_API_KEY=
ADMIN_NOTIFICATION_EMAIL=dnyal1421@gmail.com
RESEND_FROM_EMAIL=TeraKira <onboarding@resend.dev>
CRON_SECRET=
```
