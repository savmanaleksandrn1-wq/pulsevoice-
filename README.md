# PulseVoice — Supabase edition (starter)

This is a Supabase-backed starter foundation, not a claim of a fully finished Discord replacement. It includes:
- Supabase Auth sign-up/sign-in/sign-out.
- Profile creation by a database trigger; handles and display names.
- Private direct-message conversations, persisted messages, realtime new-message refresh.
- Friend requests (send, accept, decline) and user search by handle.
- Row Level Security for profiles, conversations, membership, messages, and friend requests.
- Responsive dark/light PulseVoice UI.

Voice/video rooms, community creation and roles, attachments, push notifications, password reset UX, abuse prevention/rate limits, and a production security audit are not implemented yet. Do not advertise those parts as live.

## Exact setup (Windows)

1. Create a free project at https://supabase.com/dashboard. Save the project password somewhere safe.
2. In the project, open **SQL Editor → New query**.
3. Open `supabase/schema.sql` from this repository, copy the entire file into the SQL editor, and press **Run**.
4. Open **Connect** or **Project Settings → API Keys**. Copy the Project URL and the publishable key (starts with `sb_publishable_`). Never use a `service_role` or secret key in a `NEXT_PUBLIC_` variable.
5. In the project root, copy `.env.example` to `.env.local`; paste the URL/key into it. Example:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
6. Open the project folder in VS Code, choose **Terminal → New Terminal**, then run:
   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```
7. Open http://localhost:3000. Register a different account in a private/incognito browser to test two users.

If email confirmation is enabled in Supabase Auth, registration asks you to click the confirmation link in your email. For local testing only, you may disable email confirmation in Authentication settings; re-enable it before launching publicly. Add `http://localhost:3000` under the Auth URL Configuration allowed redirect/site URLs.

## Useful checks

- TypeScript: `npm.cmd run typecheck`
- Production build: `npm.cmd run build`
- On any SQL/RLS error, check that `supabase/schema.sql` ran completely and that `.env.local` has the correct URL/key.

## Important security notes

- Only use the anon/publishable project key in the browser. Never place Supabase `service_role` or secret keys in this app.
- Direct conversations/messages have RLS and membership checks. Review policies before extending roles, communities, uploads, or admin tools.
- This is a starter implementation. Before public launch, add password recovery UX, verification UX, anti-spam/rate limits, moderation/report handling, logging, and tests including cross-account RLS tests.


## Validation status

The TypeScript/TSX files pass a compiler syntax-transpilation check. A full `npm install`, typecheck, production build and live Supabase integration test could not be run in the packaging environment because access to the npm registry failed at DNS lookup. Run the checks above in your local environment before public deployment.

## Voice, video and screen sharing (LiveKit)

Voice rooms use LiveKit. Create a project at https://cloud.livekit.io/ and add these server-only values to `.env.local` and to your hosting provider's environment variables:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
```

Never expose `LIVEKIT_API_SECRET` in a `NEXT_PUBLIC_` variable or commit it to Git. The `/api/livekit/token` endpoint checks the user's Supabase access token before issuing a one-hour room token. In Voice rooms, enter a room name and join; the LiveKit toolbar provides microphone, camera, and screen-sharing controls. Browser permissions and HTTPS are required for screen sharing in a deployed site. This integration has been added but still needs end-to-end testing with two real signed-in devices and valid LiveKit credentials.

## Deploy a public link

Deploy the project to Vercel (Hobby tier for eligible personal projects) from a private GitHub repository. Add all three Supabase variables and the three LiveKit variables in Vercel Project Settings → Environment Variables, set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS URL, then redeploy. In Supabase Authentication → URL Configuration, set the Site URL to the deployed URL and add both the deployed URL and `http://localhost:3000/**` to Redirect URLs. A public deployment cannot be completed without the owner's Vercel/GitHub authorization and valid service credentials.
