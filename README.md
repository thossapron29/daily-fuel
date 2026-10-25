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
- The database was bootstrapped with remote `init_daily_fuel`, then updated with `add_one_off_meal_ingredients` (`supabase/ingredient-meals.sql`) and `add_shared_pantry` (`supabase/pantry.sql`), followed by `add_pending_pantry_nutrition` (`supabase/pending-pantry.sql`). `supabase/schema.sql` includes all updates for fresh projects; do not rerun the bootstrap over an existing installation.
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

## Quick meal logging

**Add a meal** opens nutrition entry directly: food name, meal, total kcal and protein/carbs/fat for the selected profile/date. Numeric drafts stay as editable strings until submit so clearing a field stays empty; explicit zero is valid, while blank/negative/non-finite nutrients cannot be saved. Stored diary values remain numbers and feed the existing Dashboard totals. The app does not call ChatGPT or calculate from a text description.

The blue calorie field is the primary visual anchor, with three macro fields underneath and one butter-yellow save button. Ingredient calculation is under **วิธีบันทึกเพิ่มเติม**. Existing saved recipes are available there when present; the recipe tab and recipe-creation prompt are removed from main navigation/Dashboard. Existing recipe data is retained.

## Reuse meal history

The food-name field is an accessible autocomplete with recent meals on focus and live name matching while typing. It uses all loaded dates, independently of the Dashboard's selected date. By default it shows up to five recent distinct options for the active profile; **ดูเมนูของทั้งคู่** includes up to five per profile with the active profile first. This means both profile slots within the signed-in account, using the existing owner-isolated data; it does not connect separate login accounts.

Suggestions show the source profile, last date, kcal and P/C/F. Repeated rows collapse only when normalized name, profile and all four nutrient values match. Different portions with the same name stay separate; no averaging or portion conversion is applied. Same-date recency uses the last appended row because legacy entries have no creation timestamp.

Selecting an option copies only the food name and four editable nutrient values, retaining the destination profile/date/meal. Saving uses the existing manual entry flow and creates a new snapshot; it does not mutate the source or copy recipe/ingredient metadata. Switching profiles clears the unsaved meal draft. Arrow keys/Enter choose suggestions, Escape dismisses the popup first, and users can type a new name with no matching history. No new database table, query or migration is required.

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
