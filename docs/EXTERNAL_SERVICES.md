# External services, credentials and costs

Prices are **indicative estimates** from public price lists as last known — confirm current prices with each provider before purchasing. USD → UGX at roughly 3,700.

| Service | Purpose | Recommended plan | Indicative cost | Credentials / settings needed |
|---|---|---|---|---|
| **Vercel** | Hosts the web application | Pro (1 developer seat). Hobby is not licensed for commercial/organisational use | ~US$20 / month | Vercel account owned by the school; GitHub repo connected |
| **Managed PostgreSQL** | Database | **Neon** Launch (branching gives a free staging copy) *or* **Supabase** Pro | ~US$19–25 / month | `DATABASE_URL` per environment; choose the **Frankfurt (eu-central-1)** region to sit next to Vercel `fra1` |
| **Cloudflare R2** (or AWS S3 / Backblaze B2) — *optional* | Off-site backups; file storage only if it outgrows the database (photos/logo are stored in PostgreSQL by default) | Pay as you go | First 10 GB free, then ~US$0.015 / GB-month; no egress fees | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STORAGE_DRIVER=s3` |
| **Domain / DNS** | `smis.bishopogez.com` | Sub-domain of the school's existing domain | Free (if the school already owns bishopogez.com) | A CNAME record at the school's DNS host pointing to Vercel |
| **Africa's Talking** | SMS to parents/staff (Uganda: MTN, Airtel) | Pay as you go; register a Sender ID | ~UGX 25–35 per SMS (160 characters); Sender ID registration is a one-off fee | `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` |
| **Email (SMTP)** | Password resets, notices | Google Workspace / Zoho Mail SMTP, or Resend/Mailgun | Workspace from ~US$6/user/month; Resend free tier ~3,000 emails/month | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` |
| **WhatsApp Business (Meta Cloud API)** | WhatsApp notices | Requires a verified Meta Business account, a dedicated phone number and pre-approved templates for business-initiated messages | Meta charges per template message (utility/marketing rates vary by country) | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` |
| **GitHub** | Source code, CI, nightly backup job | Free / Team | Free for this usage | Repository secrets for the backup workflow |
| Error monitoring (optional) | Production error alerts | Vercel built-in logs; Sentry free tier optional | Free tier | `SENTRY_DSN` (integration not yet wired in) |

**Estimated running cost:** about **US$45–60 per month** (≈ UGX 170,000–220,000) for hosting, database and storage, plus SMS usage (e.g. 1,000 SMS ≈ UGX 30,000).

## Behaviour without credentials

The system works without any messaging credentials. Messages are still recorded in *SMS / Email / WhatsApp* with status **NOT CONFIGURED** — they are never reported as sent. Password-reset emails require SMTP; until then, administrators reset passwords from *Settings → Users*.

## Not included / not claimed

* **UNEB:** the UNEB module keeps the school's own candidate records and lists. There is **no official UNEB integration**; registration is still done on the UNEB portal.
* **Mobile Money collections:** payments made by MTN MoMo / Airtel Money are recorded by the bursar with the transaction reference (duplicates are refused). Automatic collection and reconciliation through the MTN MoMo or Airtel Money APIs would need merchant accounts and is listed in the backlog.
