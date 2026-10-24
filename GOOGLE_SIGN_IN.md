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

Verified on 2026-10-24: `test:google-auth`, `test:social-platform`, the production build (including TypeScript), and targeted lint for the changed authentication runtime files passed. Local HTTP checks returned the expected unavailable-provider and invalid-state redirects; unauthenticated social-account access returned 401. Full Google consent, real Google profile retrieval, and browser sign-in with production credentials remain untested.
