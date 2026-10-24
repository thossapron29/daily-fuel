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
- The database was bootstrapped with remote `init_daily_fuel`, then updated with `add_one_off_meal_ingredients` (`supabase/ingredient-meals.sql`). `supabase/schema.sql` includes both for fresh projects; do not rerun the bootstrap over an existing installation.
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
- `entries`: per-profile/date meals, stored nutrition, recipe portion metadata and one-off ingredient/source snapshots.
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

The cookbook starts with saved recipes and a create button. Creating or editing a recipe has three steps: ingredients for the full batch, name/servings (and optional measured cooked yield), then review/save. Search and select an ingredient, choose its weighed state and enter grams; source details are available in a disclosure. Switching state selects a different source record, not an invented raw-to-cooked weight conversion. Nutrition scales from per-100g source values; the source energy field is preserved rather than reconstructed using 4/4/9.

`lib/foods.ts` contains 13 curated USDA FoodData Central / SR Legacy records verified through the official Food Details API on 2026-10-23. This is an offline starter catalog, not live USDA search. Each record links to its FDC source. The catalog includes ground beef with specified fat percentages, rice, chicken breast, boiled egg, olive oil, salt, water and Greek yogurt. Match the source preparation description to the food actually weighed.

For brands/condiments, enter the label's reference grams and nutrients (e.g. per 15 g). The app normalizes the basis automatically. Saved product-label ingredients become available in later recipes and are marked as manually entered rather than USDA-verified.

Saving a recipe does not count it as eaten. **Add a meal** offers direct ingredient entry or a saved recipe. Saved recipes use the same portion form as cookbook cards. Meal shortcuts preserve Breakfast/Lunch/Dinner/Snack. Creating a recipe from this dialog also preserves the intended meal for the follow-up log. Manual calorie/macro entry is a secondary option under the nutrition-info disclosure.

For a one-off meal, choose **เลือกวัตถุดิบสำหรับมื้อนี้**, select who is eating, and enter ingredient grams actually eaten by that person. Raw/cooked selection, product labels and nutrition calculation work like the cookbook, but there is no serving denominator or recipe record. The current date/meal are prefilled; name and date adjustments are optional. Blank names use ingredient names automatically. Food diary retains ingredient grams, preparation states and source snapshots after reload. Label ingredients from these meals can be reused in later meals or recipes. Dashboard uses the stored meal nutrition for the selected person/date.

Save servings and optionally measured cooked yield. Gram portions require cooked yield; it is never inferred from raw ingredient weights. Select the people eating and enter a positive amount for each. New and Ben can log different amounts, including fractional servings, in one operation. Unchecked people receive no entry; the whole recipe need not be consumed. This is portion logging, not batch inventory management. The estimate assumes evenly mixed food; drained liquids, discarded oil and uneven servings can affect it.

Editing a recipe preserves past diary nutrition. Legacy manually entered recipes remain available for serving-based logging. Sodium tracking, Thai FCD integration and live ingredient search are not part of this version.

References: https://fdc.nal.usda.gov/api-guide/ ; https://fdc.nal.usda.gov/data-documentation/

## Verification

```sh
npm test
npx tsc --noEmit
```

`supabase/verify.sql` uses a transaction with disposable reserved test identities and rolls everything back. It verifies CRUD, import retries, atomic rollback, profile mapping, immutable diary snapshots and account isolation. It has been executed successfully against this project. Anonymous REST reads were checked and rejected with 401. The latest Supabase security advisory flags disabled [Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); database RLS remains enabled and ownership-based.

`supabase/verify-ingredient-meals.sql` additionally verifies ingredient snapshot import/read, no implicit recipe creation, import retry safety, legacy entry defaults, JSON-array validation and cross-account read isolation. It passed remotely with all fixture records rolled back. The 25 Node tests cover direct-gram totals, rounding, label scaling, independent snapshots and invalid input rejection. Local browser checks use the actual Home/Workspace in a separate origin without Supabase configuration, and cover saving, refreshing, diary details, no recipe creation, profile/date selection and mobile layout.

Browser tests cover sign-in-session loading, cloud error/retry, local import success/failure, backup retention and sign-out using mocked Auth/REST responses. No email or password belonging to the user is used in automated tests, and no real verification email is sent by tests.

The guided cookbook/meal UI was also exercised in an isolated in-memory preview using the actual Workspace components, at desktop and 390px widths. Checks included raw/cooked ingredients, label-basis scaling, recipe save without consumption, separate profile portions, Dashboard/diary totals, measured-yield gram portions and empty-person validation. These checks did not write to a real user's Supabase records.

## Deployment

Vercel project `daily-fuel` in `thossapron29's projects` is linked to this public GitHub repository. Pushes to `main` trigger production deployments. Production and Preview have `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configured in Vercel; `.env.local` is not committed.

The public repository excludes environment files, local agent skills, generated review screenshots, dependencies and build output. Profile defaults are generic examples; existing Supabase settings are retained via the initializer's ignore-duplicates behavior.

For a future custom domain, update the Supabase Auth Site URL and add only the intended exact redirect URLs. No service-role key is needed by this app.
