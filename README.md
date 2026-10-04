# WORLDSHARE.EXE (Cloudflare Pages + Supabase + GitHub)

```
public/            the website (static; this is what Cloudflare serves)
  index.html  app.js  analyze.js  config.js
supabase/schema.sql   database table + security rules + private storage bucket
scripts/create-users.mjs   creates the 4 accounts (runs on your PC only)
```

## 1. Supabase
1. supabase.com -> New project (any name/region, save the DB password).
2. **SQL Editor** -> paste all of `supabase/schema.sql` -> Run.
3. **Authentication -> Sign In / Providers**: turn **OFF "Allow new users to sign up"**.
   (Otherwise strangers could register. With it off, only the 4 accounts you create exist.)
   Email provider stays ON (needed for password login). "Confirm email" doesn't matter.
4. **Project Settings -> API**: copy the **Project URL** and **anon / publishable key**
   into `public/config.js`. (Also copy the **service_role / secret key** for step 2 - keep it private.)

## 2. Create the 4 accounts
    cp scripts/users.local.example.json scripts/users.local.json   # then put the real passwords in it
    SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/create-users.mjs
(Windows PowerShell: `$env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; node scripts/create-users.mjs`)

`users.local.json` is git-ignored - it must never be pushed. Re-run the script any time to reset a password.
Players log in with their Minecraft username + password; behind the scenes the
login is `<username lowercase>@worldshare.example.com`.

## 3. GitHub
    git init && git add . && git commit -m "worldshare"
    # create an empty repo on github.com (Private is fine), then:
    git remote add origin https://github.com/YOU/worldshare.git
    git branch -M main && git push -u origin main
Check that `scripts/users.local.json` and your service_role key are NOT in the repo.

## 4. Cloudflare
1. dash.cloudflare.com -> **Workers & Pages -> Create -> Pages -> Connect to Git** -> pick the repo.
2. Framework preset: **None**. Build command: *(empty)*. **Build output directory: `public`**.
3. Save and Deploy. You get `https://<name>.pages.dev` - send that link to your friends.
   Every `git push` redeploys automatically.
(Cloudflare sometimes reshuffles its dashboard; if you only see "Workers", choose the
static-assets / Git-import option and set the asset directory to `public`.)

## Limits & notes
- **Supabase free plan: max 50 MB per file.** Bigger worlds (many are 100 MB+) need
  Supabase Pro (raise Storage -> Settings -> file size limit AND the bucket limit in schema.sql),
  or trim the world (delete far-away chunks, `DIM-1`/`DIM1` if unused) before zipping.
  Free plan also has limited total storage and download bandwidth.
- The anon key in `config.js` is public by design; the security comes from the login + the
  row/storage policies in `schema.sql`. The service_role key must never be in the site or GitHub.
- Free Supabase projects pause after ~1 week of no activity; open the dashboard to resume.
