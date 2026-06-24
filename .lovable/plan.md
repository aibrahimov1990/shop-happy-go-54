## Personal Edits — feature plan

### What gets built (in order)

**1. Backend foundation (Lovable Cloud)**
- Enable Lovable Cloud (managed Postgres + Auth + Email).
- Auth methods turned on: **Email magic link** and **Google sign-in**.
- Tables:
  - `profiles` — id, email, full_name, created_at
  - `user_roles` — id, user_id, role (`client` | `shopper` | `admin`) — separate table, prevents privilege escalation
  - `edits` — id, shopper_id, client_email, client_user_id (nullable until claimed), title, note, status (`draft` | `sent` | `viewed`), created_at, sent_at, viewed_at
  - `edit_items` — id, edit_id, shopify_product_id, shopify_handle, position
- RLS so clients see only their own edits; shoppers see edits they created; admins see all.
- A `has_role()` security-definer function for clean policies.

**2. Shopper (admin) flow — inside the same app**
- New route `/shopper` gated by `shopper` or `admin` role (hidden from regular clients).
- "Create Edit" screen:
  - Enter client email
  - Search Shopify catalogue, tap to add products to the edit
  - Write a personal note ("Saw this Birkin and thought of you…")
  - Save as draft / Send
- "My Edits" list — see status (sent / viewed), edit, resend.

**3. Client flow**
- New route `/edits` in the bottom nav (only visible when signed in).
- Edit detail page `/edits/$id` — hero with shopper's note, then product grid; tap product → existing product page → Add to Cart → checkout.
- First time a client opens an edit link before signing in: lands on `/auth?next=/edits/xyz`, signs in with same email, then the edit auto-claims to their account.

**4. Notifications when an edit is sent**
- **Email** — Lovable Email sends a styled message: shopper's note preview + "Open your edit" button → deep link to `/edits/{id}`. Sent immediately.
- **In-app inbox** — already covered by `/edits` list; new edits show an unread dot on the nav icon (live via Supabase realtime).
- **Push notification** — stubbed now, fully wired when we add Capacitor (needs Apple/Google push certificates which only exist after the native build). The server hook is built so push goes live as soon as device tokens start arriving.

**5. Sign-in additions for clients**
- `/auth` screen with two buttons: "Continue with email" (magic link) and "Continue with Google".
- New nav item in bottom bar gets a "Sign in" CTA when signed-out.

### What you (the user) will need to do
- Confirm Lovable Cloud activation (one click when I trigger it).
- I'll seed your own email as the first `admin` so you can grant `shopper` role to your team from a small admin screen.
- For Google sign-in, no extra steps — Lovable Cloud manages it.
- For live push notifications later: an Apple Developer account ($99/yr) and a Google Play Console account ($25 one-time). Not needed for this build.

### What ships first vs later
- **This build**: backend + shopper screen + client edits screen + email delivery + in-app inbox + magic-link/Google auth.
- **Phase 2 (after Capacitor wrap)**: real push notifications on iOS/Android.

### Out of scope (ask if you want them)
- Holds / reserving stock against an edit
- Expiry dates on edits
- Read receipts shown to the shopper beyond a basic "viewed" badge
- Shopper-to-client chat

If this looks right, approve and I'll start with Cloud + auth + database, then build the screens.