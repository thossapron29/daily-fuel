# Daily Fuel

Personal nutrition journal for New & Ben, with quick calorie/macro entry and separate daily tracking.

- Live app: https://daily-fuel-inky.vercel.app
- Public source: https://github.com/thossapron29/daily-fuel
- Hosting: Vercel, linked to the repository's `main` branch.

## Connected Supabase project

- Project: **daily-fuel** (`qkyqiufpluxfgyjhtqzr`)
- Organization: **thossapron29**
- Region: **Singapore** (`ap-southeast-1`)
- Dashboard: https://supabase.com/dashboard/project/qkyqiufpluxfgyjhtqzr
- The database was bootstrapped with remote `init_daily_fuel`, then updated with `add_one_off_meal_ingredients` (`supabase/ingredient-meals.sql`) and `add_shared_pantry` (`supabase/pantry.sql`), followed by `add_pending_pantry_nutrition` (`supabase/pending-pantry.sql`). `supabase/schema.sql` includes all updates, including `supabase/shared-menus.sql` (remote `add_partner_menu_lookup` and `explicit_menu_link_deny_policy`), for fresh projects; do not rerun the bootstrap over an existing installation.
- `.env.local` contains the project URL and public publishable key. It is ignored by Git. No service-role/secret key is used in the browser.
- Auth Site URL is `https://daily-fuel-inky.vercel.app`. Exact redirect URLs allow the production root (with and without a trailing slash) and `http://localhost:3001` (with and without a trailing slash). Email confirmation remains enabled.

## Run and sign in

```sh
npm run dev -- --port 3001
```

The current app uses Supabase whenever both URL and publishable key are configured. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is preferred; the old `NEXT_PUBLIC_SUPABASE_ANON_KEY` name remains supported. Partial configuration produces an explicit error rather than silently switching to local mode. With neither configured, local demo mode is still supported for development.

Create an account in the Daily Fuel app, confirm its email, then sign in. Use that same app account on both devices and switch between the New and Ben profiles. Signing into the Supabase management dashboard is separate from signing into Daily Fuel. App accounts and passwords are chosen by the user; no real app account is pre-created by setup.

Data is fetched on sign-in or refresh. Loading failures show a retry screen instead of misleading empty totals. The two profile slots are initialized with an idempotent upsert, so concurrent first logins do not overwrite settings. Supabase is the source of truth; changes are not mirrored into the old local demo snapshot.

## Bring existing browser data into Supabase

Browser storage belongs to its origin: if your existing data was entered on `localhost:3001`, sign into that local app with the same account and import there. It will then be available on the live app after refresh.

After signing into an empty household, the app offers **นำเข้าข้อมูลเดิม** when it finds a valid `dailyfuel` snapshot in that browser. Import before entering new cloud meals or recipes.

The import includes both profiles and goals, recipes (including ingredient/source snapshots), pantry items, diary entries and weight logs. The server maps local profile slots to new database UUIDs and assigns ownership from the authenticated session. It performs the entire operation in one transaction, records a receipt to make retries idempotent, and rejects importing over existing cloud records. On failure, partial cloud data is rolled back and the original browser data remains untouched. The original `dailyfuel` value is retained even after success.

## Tables and access

- `pantry_items`: account-owned reusable foods/condiments shared by both profiles, including brand, barcode, native g/ml unit and reversible archive status.
- `profiles`: New/Ben body data, calorie goal and macro plan.
- `recipes`: shared recipes, ingredient nutrition snapshots and cooked yield.
- `entries`: per-profile/date meals, stored nutrition, recipe portion metadata and one-off ingredient/source snapshots.
- `weights`: per-profile/date weight history.
- `import_receipts`: per-account import fingerprints for safe retries.

Every table has RLS enabled. Authenticated users can read/write only their own diary, profiles and household records. The restricted linked-menu RPC below is the sole exception for a read-only name/nutrient projection; it grants no direct diary/profile access. Public/anonymous roles have no table access. Composite foreign keys prevent linking an entry to another owner's profile or recipe. `import_local_data` is a security-invoker function restricted to authenticated callers; it does not bypass RLS. One shared app login means both people can view and edit both profiles.

## Nutrition calculations

TDEE is BMR times the activity factor, rounded once at the end. Blank optional Body Fat uses Mifflin–St Jeor (male +5, female −161). A valid Body Fat percentage selects Katch–McArdle: `370 + 21.6 × weightKg × (1 − bodyFatPercent / 100)`.

Maintenance uses TDEE; Cutting starts at TDEE −300; Bulking starts at TDEE +200 kcal. Advanced settings can replace this adjustment. These are selectable starting presets, not universal prescriptions. Existing custom adjustments are retained.

| Macro plan | Protein | Carbs | Fat |
| --- | --- | --- | --- |
| Moderate Carb | 30% | 35% | 35% |
| Lower Carb | 40% | 20% | 40% |
| Higher Carb | 30% | 50% | 20% |

Macro grams use the selected calorie goal, at 4 kcal/g for protein/carbohydrates and 9 kcal/g for fat. Dashboard and Settings share the same helper. Display rounding can cause a small energy difference. Both initial profiles use generic example body data. Update them before using personal targets. Saved Supabase profiles are retained during updates.

## Quick meal logging

**Add a meal** opens nutrition entry directly: food name, meal, total kcal and protein/carbs/fat for the selected profile/date. Numeric drafts stay as editable strings until submit so clearing a field stays empty; explicit zero is valid, while blank/negative/non-finite nutrients cannot be saved. Stored diary values remain numbers and feed the existing Dashboard totals. The app does not call ChatGPT or calculate from a text description.

The blue calorie field is the primary visual anchor, with three macro fields underneath and one butter-yellow save button. Ingredient calculation is under **วิธีบันทึกเพิ่มเติม**. Existing saved recipes are available there when present; the recipe tab and recipe-creation prompt are removed from main navigation/Dashboard. Existing recipe data is retained.

## Reuse meal history

The food-name field is an accessible autocomplete with recent meals on focus and live name matching while typing. It uses all loaded dates, independently of the Dashboard's selected date. By default it shows up to five recent distinct options for the active profile; **ดูเมนูของทั้งคู่** includes up to five per profile with the active profile first. Both profile slots in this account remain available. Explicitly linked accounts also contribute a narrow menu projection when this switch is enabled; partner options carry an **อีกบัญชี** badge and no consumption dates.

Suggestions show the source profile, last date, kcal and P/C/F. Repeated rows collapse only when normalized name, profile and all four nutrient values match. Different portions with the same name stay separate; no averaging or portion conversion is applied. Same-date recency uses the last appended row because legacy entries have no creation timestamp.

Selecting an option copies only the food name and four editable nutrient values, retaining the destination profile/date/meal. Saving uses the existing manual entry flow and creates a new snapshot; it does not mutate the source or copy recipe/ingredient metadata. Switching profiles clears the unsaved meal draft. Arrow keys/Enter choose suggestions, Escape dismisses the popup first, and users can type a new name with no matching history. Own-account suggestions use already loaded history; linked-account suggestions use the restricted RPC described below.

## Linked accounts: menus only

`supabase/shared-menus.sql` adds a private administrator-managed `dailyfuel_private.menu_links` table and an authenticated `shared_menu_options(search_query)` RPC. Only the two user-authorized accounts were linked in the live database; account identifiers are kept out of public source. Account-link rows have no API table grants and an explicit deny policy. An account cannot add its own partner through the app or RPC.

The public RPC is security-invoker and delegates to a private, read-only security-definer function with a fixed empty search path, an `auth.uid()` guard, and a server-side partner relationship check. This deliberate privilege boundary returns only stable menu keys, source profile name/slot, food names, kcal and P/C/F. It returns no owner IDs, diary IDs, dates, meal slots, recipe/ingredient metadata, weights or goals. Existing owner-only policies on entries/profiles/weights remain unchanged. Unlinked accounts get no partner results; anonymous calls cannot execute the RPC. Removing a link immediately removes future partner lookup access, while meals already saved by the recipient remain their own snapshots.

Partner matching happens on the server with literal substring search, deduplication and at most five distinct options per source profile. The autocomplete debounces requests, ignores stale responses, refreshes on opening the shared list, and offers retry on lookup failure. These options exist only in dialog memory and are never merged into journal entries or local backups. Selecting a partner option copies only editable name/nutrients; saving uses the recipient's current account/profile/date/meal and the usual owner-scoped insert.

`supabase/verify-shared-menus.sql` verifies projection fields, exact duplicates versus different portions, linked lookup in both directions, isolated diaries/goals, source preservation after copying, outsider/anonymous denial, link-write denial and revocation. All test users and entries are rolled back. The live accounts were separately checked with read-only authenticated-role queries: partner menu lookup succeeds while direct foreign diary reads remain zero.

## Daily Fuel Plugin + MCP

The default onboarding at `/gpt` now uses a custom MCP plugin, not GPT Actions. Server URL: `https://daily-fuel-inky.vercel.app/mcp`. Public OAuth resource metadata is at `/.well-known/oauth-protected-resource` (also the `/mcp` suffix variant), and authorization-server metadata is at `/.well-known/oauth-authorization-server`. Discovery advertises static confidential clients, S256, resource `https://daily-fuel-inky.vercel.app/mcp`, and issuer identification. No DCR or CIMD is advertised. Client ID/secret are registered through the signed-in setup UI and entered directly by the owner in ChatGPT's Advanced OAuth settings. Plugin callbacks are exact allowlisted ChatGPT connector URLs. Existing legacy Action clients remain separate and usable until revoked.

`lib/mcp.ts` implements stateless JSON-RPC/Streamable HTTP with public initialize/tools-list/ping, JSON or SSE replies, no server-side session, origin checks, per-tool OAuth security schemes and tool-level authentication metadata. The three tools are getMealRecipients, prepareMealBatch and getMealBatchStatus. They reuse the existing gateway and meal validation. Only draft preparation changes private pending state; receipt/status is read-only. The endpoint rejects arbitrary approval fields and binds every protected call to the server-owned MCP resource identifier.

`supabase/household-mcp.sql` changes MCP to one shared account with two owned New/Ben profiles. A native human must explicitly consent to household access; existing grants are not automatically expanded. MCP clients are creator-only. Private recipient aliases map to that owner's two profiles and the same resolver controls discovery and inserts. No diary/profile data is copied from another account and public table RLS remains unchanged. Legacy GPT Actions retain the earlier per-account consent model.

`supabase/mcp.sql` adds integration kind, resource binding on codes/tokens/drafts, approval audit fields and a shared private commit helper. MCP authorization requires S256 and the exact resource through both authorization and exchange/refresh. A token for the MCP audience cannot be replayed at the legacy REST resource. Issuer `iss` is returned on successful/denied authorization redirects.

**Human review is enforced by the server, not model hints.** An MCP draft cannot be committed by the OAuth token, even with a forged approved flag. The owner opens `/gpt/review/<draft_id>` with their native Supabase session, reviews both immutable entries and clicks one confirmation button. The private helper locks current client/consents/links/draft and appends all entries atomically. Other native accounts cannot approve that draft. The MCP status tool then returns the original receipt without another write. Legacy REST commits still retain the prior Action confirmation flow.

`supabase/verify-mcp.sql` tests required resource/S256, audience rejection, inability of a model token to approve, native owner checks, paired atomic append, audit, rounding, separate totals/goals and replay in a rollback-only transaction. The full legacy OAuth batch verification also remains valid. Transport/auth metadata tests are in `tests/mcp.test.mjs`. User guidance is at `/plugin/setup.md` and `/plugin/instructions.txt`.

## Legacy Daily Fuel GPT: scoped OAuth and joint meal logging

The integration is deployed at `/gpt`. It prepares connection settings and exposes `/api/gpt/openapi`, `/gpt/instructions.txt`, `/gpt/setup.md` and `/gpt/privacy`. A user must create/save their GPT, register its exact callback through the signed-in setup page, copy the one-time client credentials into the GPT editor, and grant access. No real OAuth clients/grants are automatically created or activated by setup. Both people must independently select their own profile and enable partner logging for the **same** GPT client before one connected ChatGPT conversation can append meals for both.

`supabase/gpt-actions.sql` adds private client, consent, code, token and draft/receipt tables, all denied direct API access, plus a narrowly authenticated `gpt_bridge` RPC. Applied remote changes include `add_scoped_gpt_oauth_and_atomic_meal_batches`, `recheck_receiver_client_membership_for_gpt_batches`, `invalidate_gpt_codes_on_consent_withdrawal` and `serialize_gpt_token_exchange_with_consent_changes`. The fresh schema includes their final definitions. Account links still confer menu lookup only; bilateral, per-client logging consent is a separate capability and does not merge diary/profile access.

This is a confidential authorization-code OAuth bridge on the app's own domain, compatible with GPT Actions. It uses existing Supabase sessions only for setup/consent, and issues independent opaque, narrowly scoped capabilities for the Action. It does **not** hand a full Supabase session to ChatGPT. Codes expire in 5 minutes and are single-use, optional S256 is verified, access lasts 1 hour, and rotating refresh credentials expire after at most 30 days. Refresh reuse revokes the family. Withdrawal invalidates tokens and unused codes; profile changes rotate recipient IDs and invalidate old credentials. Secrets/codes/tokens have 256 bits of randomness and are persisted only as SHA-256 hashes, with raw credential verification inside Postgres. No service-role key or OpenAI API key is required by the web app.

The private security-definer gateway deliberately distinguishes native session-only consent operations from opaque-token operations. Token operations can only list authorized recipient aliases, prepare immutable nutrient drafts and append confirmed batches. They cannot read diary/body/goal data, alter an old meal, create an account relationship or grant themselves a partner. Client membership, both consents and account links are rechecked for new writes. Consent/client/relationship rows and drafts are locked during commits; exchange/rotation is serialized with consent changes. Public entries/profiles/weights policies stay owner-only.

The API flow is `GET /api/gpt/recipients` → `POST /api/gpt/meal-drafts` → `POST /api/gpt/meal-drafts/{draft_id}/confirm`. Preparing does not affect the diary. The last Action has `x-openai-isConsequential: true`, requiring ChatGPT's per-operation approval; the server requires the pre-existing immutable draft. One confirmation appends one or two distinct recipients in a single transaction. Duplicate prepare UUIDs with unchanged normalized values return the same draft; changed values using that UUID return 409. Repeating a committed draft returns the original receipt without appending. Idempotency is durable in Postgres, including across server restarts; the in-process HTTP throttle is only best effort. A receipt retry after successful recording does not repeat a write. OAuth revocation still invalidates the connection.

Estimated records carry `nutrition_source=chatgpt_estimate`, shown in the diary. Exact label/user totals can be identified separately. The web app refreshes its own records when it regains focus; partner journal rows are never loaded into its totals. OAuth secrets are only shown once in setup and must be copied by the owner, outside chat/public files.

Verification: `tests/gpt-actions.test.mjs` exercises request validation, callbacks/state/S256 syntax, own-versus-pair shapes, consequential schema flags, real route handlers with mocked transport, conflict/permission handling and Basic/form token exchange. `supabase/verify-gpt-actions.sql` exercises the actual gateway under test identities with **all data rolled back**, covering code binding/replay, S256, bilateral consent, pair atomicity, durable replay/conflicts, separate totals/goals, stale consent, hash non-replay, outsiders, refresh rotation/reuse and revocation/re-consent. Live HTTP checks with anonymous/invalid credentials were rejected with 401; OpenAPI is readable. The positive authenticated HTTP→database→ChatGPT path still needs the owner's first GPT registration/linking. No committed production test identities/credentials were created. UI checks use isolated, synthetic account fixtures.

## Existing Recipe Builder

The cookbook starts with saved recipes and a create button. Creating or editing a recipe has three steps: ingredients for the full batch, name/servings (and optional measured cooked yield), then review/save. Search and select an ingredient, choose its weighed state and enter grams; source details are available in a disclosure. Switching state selects a different source record, not an invented raw-to-cooked weight conversion. Nutrition scales from per-100g source values; the source energy field is preserved rather than reconstructed using 4/4/9.

`lib/foods.ts` contains 35 curated USDA FoodData Central / SR Legacy records verified through the official Food Details API on 2026-10-23/24. This is an offline starter catalog, not live USDA search. Each record links to its FDC source. The Thai cooking starter library includes raw/cooked pork and beef, rice, chicken, eggs, shrimp, tofu, vegetables, herbs, sugar, oils and generic fish/oyster/soy sauces. Generic sauces and basil are explicitly labelled as reference values; they are not nutrition for a particular Thai brand or cultivar. Match the source preparation description to the food actually weighed.

For brands/condiments, enter the label's reference grams and nutrients (e.g. per 15 g). The app normalizes the basis automatically. Saved product-label ingredients become available in later recipes and are marked as manually entered rather than USDA-verified.

Saving a recipe does not count it as eaten. Existing saved recipes use the same portion form as cookbook cards, through the additional logging methods. Meal shortcuts preserve Breakfast/Lunch/Dinner/Snack.

For a one-off meal, open **วิธีบันทึกเพิ่มเติม → คำนวณจากวัตถุดิบ**, select who is eating, and enter ingredient amounts actually eaten by that person. Raw/cooked selection, product labels and nutrition calculation work like the cookbook, but there is no serving denominator or recipe record. The current date/meal are prefilled; name and date adjustments are optional. Blank names use ingredient names automatically. Food diary retains ingredient amounts/units, preparation states and source snapshots after reload. Label ingredients from these meals can be reused in later meals or recipes. Dashboard uses the stored meal nutrition for the selected person/date.

Save servings and optionally measured cooked yield. Gram portions require cooked yield; it is never inferred from raw ingredient weights. Select the people eating and enter a positive amount for each. New and Ben can log different amounts, including fractional servings, in one operation. Unchecked people receive no entry; the whole recipe need not be consumed. This is portion logging, not batch inventory management. The estimate assumes evenly mixed food; drained liquids, discarded oil and uneven servings can affect it.

Editing a recipe preserves past diary nutrition. Legacy manually entered recipes remain available for serving-based logging. Sodium tracking, Thai FCD integration and live ingredient search are not part of this version.

References: https://fdc.nal.usda.gov/api-guide/ ; https://fdc.nal.usda.gov/data-documentation/

## Verification

```sh
npm test
npx tsc --noEmit
```

`supabase/verify.sql` uses a transaction with disposable reserved test identities and rolls everything back. It verifies CRUD, import retries, atomic rollback, profile mapping, immutable diary snapshots and account isolation. It has been executed successfully against this project. Anonymous REST reads were checked and rejected with 401. The latest Supabase security advisory flags disabled [Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); database RLS remains enabled and ownership-based.

`supabase/verify-ingredient-meals.sql` additionally verifies ingredient snapshot import/read, no implicit recipe creation, import retry safety, legacy entry defaults, JSON-array validation and cross-account read isolation. It passed remotely with all fixture records rolled back. The Node tests cover direct-gram totals, rounding, label scaling, independent snapshots and invalid input rejection. Local browser checks use the actual Home/Workspace in a separate origin without Supabase configuration, and cover saving, refreshing, diary details, no recipe creation, profile/date selection and mobile layout.

Browser tests cover sign-in-session loading, cloud error/retry, local import success/failure, backup retention and sign-out using mocked Auth/REST responses. No email or password belonging to the user is used in automated tests, and no real verification email is sent by tests.

Quick-entry checks cover deleting an explicit 0 to a blank field, typing 10 without a leading 0, decimal values, explicit zero, rejecting missing nutrients, and Dashboard/diary totals after save and refresh. The updated form was visually checked at 375px and desktop widths in a separate local origin without Supabase configuration.

The guided cookbook/meal UI was also exercised in an isolated in-memory preview using the actual Workspace components, at desktop and 390px widths. Checks included raw/cooked ingredients, label-basis scaling, recipe save without consumption, separate profile portions, Dashboard/diary totals, measured-yield gram portions and empty-person validation. These checks did not write to a real user's Supabase records.

## Shared pantry and barcode lookup

Open **Pantry** to save ingredients independently of meals and recipes. Both profile slots use the same account-owned pantry. Products retain name, brand/variant, category, preparation, barcode, label basis and source. Saving does not add calories to the journal. Editing a pantry item does not change previous meal/recipe ingredient snapshots. Archiving hides an item from new selections; it can be restored. No hard-delete operation is exposed for pantry items.

Choose **ของในตู้**, **คลังอาหารไทย** or **ทั้งหมด** in the meal/recipe picker. Add a label or look up a barcode from either the pantry page or the ingredient picker. Product forms require all four nutrients and an explicit review; missing data is left blank instead of filled with zero. Catalogue reference nutrition/units/preparation are kept fixed when copying it into the pantry; use a new label entry for a branded product.

Nutrition values are stored per 100 of the food's native unit (`g` or `ml`). A label per 15 ml is scaled within ml; no density is invented. Legacy ingredients still use grams. The historical JSON quantity key remains `grams` for compatibility, with `unit: "ml"` for volume entries; new snapshots always specify a unit. Cooked recipe yield remains a separately measured mass in grams.

**ค้นหาด้วยบาร์โค้ด** accepts a typed/pasted EAN/UPC/GTIN, validates its checksum and canonicalizes UPC/GTIN equivalents. It checks this household's pantry first, then `/api/barcode` queries Open Food Facts v3.6. The server verifies the session with Supabase Auth before querying the external database. Unconfigured production or unauthenticated requests are rejected. Local development without Supabase configuration supports isolated UI tests.

The parser chooses one `as_sold` packaging nutrition set with an explicit quantity/unit, never blends g/ml datasets or estimated nutrients, and preserves unknowns. Barcode results must be reviewed against the actual label. Queries have a 10-second upstream timeout, a 24-hour public-product fetch cache and an 8/minute per-account **best-effort process-local** throttle; this is not a distributed quota. There are no external writes or product-photo uploads. Camera scanning and label-photo OCR are deferred.

Open Food Facts is community-provided data under [ODbL](https://openfoodfacts.github.io/openfoodfacts-server/api/). Imported records retain attribution and their product link. Data coverage/completeness varies; manual label entry remains available on failures or missing fields. No product data is uploaded back to Open Food Facts.

`supabase/verify-pantry.sql` passed remotely with all fixtures rolled back: pantry import/read, ownership assignment, barcode uniqueness, archive/restore, preserved meal snapshots and cross-account RLS. The automated tests also cover native units, legacy compatibility, barcode parsing, production authentication, missing data, upstream failures and rate limits. Browser checks used the actual Home/Workspace at an isolated local origin, including a real read-only barcode lookup, independent pantry save, shared profile use, mixed g/ml meal logging, reload persistence and mobile layout.


Products added administratively without verified nutrition can be retained with `needs_nutrition=true` and nullable nutrient fields. Cards display dashes, editing starts with blank unknown fields, and these products are excluded from recipe/meal selection until all values are filled and reviewed. Ready products are guarded by a database constraint requiring all four nutrients. Unknown is never interpreted as zero. `supabase/verify-pending-pantry.sql` verifies pending import, NULL preservation, ready-state validation, completion and owner isolation with rolled-back fixtures. The product's net package mass is not used to infer its nutrition.

## Deployment

Vercel project `daily-fuel` in `thossapron29's projects` is linked to this public GitHub repository. Pushes to `main` trigger production deployments. Production and Preview have `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured in Vercel; `.env.local` is not committed.

The public repository excludes environment files, local agent skills, generated review screenshots, dependencies and build output. Profile defaults are generic examples; existing Supabase settings are retained via the initializer's ignore-duplicates behavior.

For a future custom domain, update the Supabase Auth Site URL and add only the intended exact redirect URLs. No service-role key is needed by this app.


### Daily nutrition check-ins

`lib/nutrition-insights.ts` distinguishes macro/calorie planning targets from adult nutrient limits. Dashboard shows persistent over-plan amounts and a dismissible five-second toast once per account/profile/date/nutrient per browser tab session. Protein completion is not treated as an upper limit. Sodium uses a <2,000 mg/day adult reference; free sugar allowance uses 10% of the selected calorie target / 4 g, clearly labeled as a planning reference. Total sugars are recorded separately and are not compared with the free-sugar allowance. Reference: https://www.who.int/news-room/fact-sheets/detail/healthy-diet

`supabase/extra-nutrients.sql` (remote `add_optional_meal_sugars_and_sodium`) adds nullable `sodium_mg`, `total_sugar_g`, `free_sugar_g` eaten-portion snapshots to entries, bounded finite-value checks and a free-vs-total consistency constraint. Existing rows stay NULL. Manual entry, local import, owned meal autocomplete, immutable MCP drafts, native review, commit and receipts preserve these fields; legacy REST batches continue working. Omitted/NULL optional fields have the same unknown meaning without changing old request hashes. Shared menus from another auth account remain the original macro-only projection and clear optional draft values. Ingredient/recipe calculations remain macro-only and leave the new fields unknown.

The Dashboard reports coverage per nutrient (e.g. 2/6 records) and labels estimates. Unknown is never zero, and partial under-limit totals are never shown as a complete daily result. ChatGPT should use label/brand/sauce quantities first and omit uncertain optional nutrients instead of inventing zeros.

Verification: `npm test`, production build, `supabase/verify-extra-nutrients.sql` with full rollback, existing MCP/Actions regression checks, and isolated browser fixtures for 375/768/1024/1440 layouts, optional validation, clearing to unknown and known zero. No real diary entries are fabricated for this feature's tests.
