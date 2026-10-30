# Using a custom domain

**Why:** on `jenilmistryhq.github.io`, every project shares one browser origin. Another project on
that address (for example SYNAPSE) could read this app's saved progress and practice log. A domain of your own, such as `bansuri.example.com`, gives the app its own origin.

Everything in the app uses relative paths, so it works at any address without code changes.

## Steps

1. **Buy or choose a domain.** A subdomain of one you own is fine, e.g. `bansuri.example.com`.
2. **DNS:** at your DNS provider, add a `CNAME` record from `bansuri` to `jenilmistryhq.github.io`.
   For an apex domain like `example.com`, use `A` records to GitHub Pages' IPs instead; see GitHub's
   "Managing a custom domain for your GitHub Pages site".
3. **Repository settings > Pages > Custom domain:** enter the domain and save. GitHub checks the DNS.
   With GitHub Actions deployments no `CNAME` file is needed; the setting lives in the repository.
4. **Enforce HTTPS** in the same settings page once the certificate is issued (it can take up to a day).
   HTTPS is required for the microphone, the service worker and installing the app.
5. **Repository settings > Secrets and variables > Actions > Variables:** add `SITE_URL` =
   `https://bansuri.example.com/docs/`. The next deploy builds the reference site with that address.
6. Update the two links at the top of `README.md` and the app link in `bansuri-mastery/README.md`.

## Moving existing learners

Progress lives in each browser, per origin, so it does not follow the move automatically. Learners
should **download a backup** (Settings) on the old address and **restore** it on the new one. Keep
the old address working for a while, and add a notice there linking to the new one.
