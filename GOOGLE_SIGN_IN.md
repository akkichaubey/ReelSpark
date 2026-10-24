# Google sign-in

ReelSpark uses Google's authorization-code flow with PKCE, state, and nonce checks. The server verifies Google's signed ID token with `jose` before creating a regular application session. Google credentials and tokens are never sent to the client UI or stored in localStorage.

## Configure your Google application

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create a project.
2. In Google Auth Platform, configure Branding and Audience. While your external application is in Testing, add your Google account under test users.
3. Under Clients, create an OAuth client of type **Web application**.
4. Add this exact authorized redirect URI for local development:

   ```text
   http://localhost:3000/api/auth/google/callback
   ```

5. Add these values to the ignored `.env.local` file. Keep all existing Cloudflare and AI settings:

   ```dotenv
   AUTH_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=your_web_application_client_id
   GOOGLE_CLIENT_SECRET=your_web_application_client_secret
   ALLOW_DEMO_LOGIN=false
   ```

6. Restart `npm run dev`. Use `http://localhost:3000` consistently, then open Sign In and select **Continue with Google**. If Google rejects an embedded browser, open the app in a normal Chrome or Edge window.

For production, register `https://YOUR_DOMAIN/api/auth/google/callback` in the same OAuth client's authorized redirect URIs and set `AUTH_URL=https://YOUR_DOMAIN` on the server. Production requires an explicitly configured HTTPS origin. A Cloudflare API token is not a Google Client Secret.

Official references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Accounts and storage

- The existing D1 `users` and `sessions` tables are reused. No new schema or migration is required for this feature.
- New Google users receive the normal `user` role. Their stable identity derives from Google's verified subject identifier, not their email address.
- Returning Google users reuse the same application account. Google-only accounts cannot sign in with a password.
- A Google identity whose email matches a separate password account is not automatically linked. Sign in with that account's existing password instead. Manual account linking is not implemented.
- A configured D1 database must successfully save the user and session. A database failure does not silently create a local identity. When D1 is not configured, the existing local authentication store remains available.
- Default `admin/admin` access and anonymous demo API access are disabled. Development-only demo access requires `ALLOW_DEMO_LOGIN=true`; it remains disabled in production regardless of that value. Existing demo data is not deleted, but demo sessions are rejected when demo access is disabled.
- Google login sets the existing HTTP-only session cookie, and logout revokes it in storage. Session cookies are Secure for HTTPS deployments.
- Google access/refresh tokens are not stored; only identity scopes (`openid email profile`) are requested. This does not connect a user's YouTube channel or grant publishing permissions.

## Verification

```powershell
npm run test:google-auth
npm run test:social-platform
npm run build
```

The Google suite uses local signing keys and mocked Google/D1 endpoints. It verifies first and returning login, session rotation, current-user lookup, logout, password registration/login, email collision handling, PKCE exchange, expired/mismatched state, nonce, audience, unverified email, forged signatures, missing settings, and database failure. It creates no real Google or Cloudflare accounts.

Live Google consent and real-account sign-in still require your OAuth Client ID and Secret. These were not configured during implementation. Do not put real tokens or client secrets into `.env.example` or Git.

## Live configuration update — 2026-10-24

- Created ReelSpark branding and the Web client in Google project
  `dev-oauthentication`, with an External/Testing audience.
- Registered callbacks for `http://localhost:3000`, `http://127.0.0.1:3000`
  and `https://reelspark-b7d8.onrender.com`, each ending in
  `/api/auth/google/callback`.
- Saved credentials only in ignored `.env.local` and the Render service's
  environment. Local AUTH_URL remains `http://localhost:3000`; Render AUTH_URL
  remains `https://reelspark-b7d8.onrender.com`. Demo login stays disabled.
- Actual HTTP checks on both origins: `/api/auth/providers` returned HTTP 200
  with `google=true`; `/api/auth/google` redirected to `accounts.google.com`
  using the correct origin-specific callback. No credential values are recorded
  in this document.
- These checks verify configuration and flow initiation, not completed Google
  consent, callback token exchange, session creation or durable user storage.
  The Render D1 configuration is still pending.

Subsequent live browser verification completed Google account selection and
basic profile/email consent, returned through the hosted callback and displayed
the authenticated dashboard with the expected account name. The provider and
session flow works on the current Render instance. This does not verify durable
session persistence: Render has no D1 credentials yet. A read-only schema query
confirmed the intended D1 database already contains `users` and `sessions`, so
auth needs no schema migration. The three Render D1 environment fields are
prepared but empty pending explicit credential-transfer approval. No migration,
new D1 user/session, or object-store operation was performed in this check.

Verified on 2026-10-24: `test:google-auth`, `test:social-platform`, the production build (including TypeScript), and targeted lint for the changed authentication runtime files passed. Local HTTP checks returned the expected unavailable-provider and invalid-state redirects; unauthenticated social-account access returned 401. Full Google consent, real Google profile retrieval, and browser sign-in with production credentials remain untested.
