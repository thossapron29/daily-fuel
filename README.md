# Daily Fuel

Personal nutrition journal for New & Ben, with a shared cookbook and separate daily tracking.

- Live app: https://daily-fuel-inky.vercel.app
- Public source: https://github.com/thossapron29/daily-fuel
- Hosting: Vercel, linked to the repository's `main` branch.

## Connected Supabase project

- Project: **daily-fuel** (`qkyqiufpluxfgyjhtqzr`)
- Organization: **thossapron29**
- Region: **Singapore** (`ap-southeast-1`)
- Dashboard: https://supabase.com/dashboard/project/qkyqiufpluxfgyjhtqzr
- The full schema in `supabase/schema.sql` has already been applied as the remote `init_daily_fuel` migration. It is a fresh-project bootstrap, not a script to rerun over an existing installation.
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

The import includes both profiles and goals, recipes (including ingredient/source snapshots), diary entries and weight logs. The server maps local profile slots to new database UUIDs and assigns ownership from the authenticated session. It performs the entire operation in one transaction, records a receipt to make retries idempotent, and rejects importing over existing cloud records. On failure, partial cloud data is rolled back and the original browser data remains untouched. The original `dailyfuel` value is retained even after success.

## Tables and access

- `profiles`: New/Ben body data, calorie goal and macro plan.
- `recipes`: shared recipes, ingredient nutrition snapshots and cooked yield.
- `entries`: per-profile/date meals, stored nutrition and recipe portion metadata.
- `weights`: per-profile/date weight history.
- `import_receipts`: per-account import fingerprints for safe retries.

Every table has RLS enabled. Only authenticated users can read/write their own household. Public/anonymous roles have no table access. Composite foreign keys prevent linking an entry to another owner's profile or recipe. `import_local_data` is a security-invoker function restricted to authenticated callers; it does not bypass RLS. One shared app login means both people can view and edit both profiles.

## Nutrition calculations

TDEE is BMR times the activity factor, rounded once at the end. Blank optional Body Fat uses Mifflin–St Jeor (male +5, female −161). A valid Body Fat percentage selects Katch–McArdle: `370 + 21.6 × weightKg × (1 − bodyFatPercent / 100)`.

Maintenance uses TDEE; Cutting starts at TDEE −300; Bulking starts at TDEE +200 kcal. Advanced settings can replace this adjustment. These are selectable starting presets, not universal prescriptions. Existing custom adjustments are retained.

| Macro plan | Protein | Carbs | Fat |
| --- | --- | --- | --- |
| Moderate Carb | 30% | 35% | 35% |
| Lower Carb | 40% | 20% | 40% |
| Higher Carb | 30% | 50% | 20% |

Macro grams use the selected calorie goal, at 4 kcal/g for protein/carbohydrates and 9 kcal/g for fat. Dashboard and Settings share the same helper. Display rounding can cause a small energy difference. Both initial profiles use generic example body data. Update them before using personal targets. Saved Supabase profiles are retained during updates.

## Recipe Builder

Choose ingredients, raw/cooked state and grams for the full batch. Switching state selects a different source record, not an invented raw-to-cooked weight conversion. Nutrition scales from per-100g source values; the source energy field is preserved rather than reconstructed using 4/4/9.

`lib/foods.ts` contains 13 curated USDA FoodData Central / SR Legacy records verified through the official Food Details API on 2026-10-23. This is an offline starter catalog, not live USDA search. Each record links to its FDC source. The catalog includes ground beef with specified fat percentages, rice, chicken breast, boiled egg, olive oil, salt, water and Greek yogurt. Match the source preparation description to the food actually weighed.

For brands/condiments, enter the label's reference grams and nutrients (e.g. per 15 g). The app normalizes the basis automatically. Saved product-label ingredients become available in later recipes and are marked as manually entered rather than USDA-verified.

Save servings and optionally measured cooked yield. Gram portions require cooked yield; it is never inferred from raw ingredient weights. New and Ben can log different amounts, including fractional servings, in one operation. Blank/zero skips that person; the whole recipe need not be consumed. This is portion logging, not batch inventory management. The estimate assumes evenly mixed food; drained liquids, discarded oil and uneven servings can affect it.

Editing a recipe preserves past diary nutrition. Legacy manually entered recipes remain available for serving-based logging. Sodium tracking, Thai FCD integration and live ingredient search are not part of this version.

References: https://fdc.nal.usda.gov/api-guide/ ; https://fdc.nal.usda.gov/data-documentation/

## Verification

```sh
npm test
npx tsc --noEmit
```

`supabase/verify.sql` uses a transaction with disposable reserved test identities and rolls everything back. It verifies CRUD, import retries, atomic rollback, profile mapping, immutable diary snapshots and account isolation. It has been executed successfully against this project. Anonymous REST reads were checked and rejected with 401. The Supabase security advisor returned no findings.

Browser tests cover sign-in-session loading, cloud error/retry, local import success/failure, backup retention and sign-out using mocked Auth/REST responses. No email or password belonging to the user is used in automated tests, and no real verification email is sent by tests.

## Deployment

Vercel project `daily-fuel` in `thossapron29's projects` is linked to this public GitHub repository. Pushes to `main` trigger production deployments. Production and Preview have `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured in Vercel; `.env.local` is not committed.

The public repository excludes environment files, local agent skills, generated review screenshots, dependencies and build output. Profile defaults are generic examples; existing Supabase settings are retained via the initializer's ignore-duplicates behavior.

For a future custom domain, update the Supabase Auth Site URL and add only the intended exact redirect URLs. No service-role key is needed by this app.
