# Daily Fuel visual direction

The active palette is **Butter & Cobalt**, inspired by the live Bread & Butter reference at https://breadandbutter.club/. The user's direction is a butter-yellow canvas, cream cards, charcoal text, and blue primary actions.

## Active palette

| Role | Color | Use |
| --- | --- | --- |
| Canvas | #FFF4C8 | Butter-yellow background across the app and installed PWA |
| Paper | #FFFBEC | Cream cards, journals, forms and dialogs |
| Ink | #393939 | Headings, body text and key nutrition values |
| Muted ink | #696557 | Supporting text on cream and yellow backgrounds |
| Cobalt | #063FBE | Primary buttons, links, icons and energy visualization |
| Deep cobalt | #04329A | Primary button hover |
| Soft blue | #E8EDFF | Selected controls and supporting icon backgrounds |
| Butter accent | #F5DB79 | Apron detail and decorative accents |
| Butter cream | #FFF0B3 | Supporting notes and calendar background accents |
| Line | #E4D9B4 | Warm dividers and card borders |

Overview uses the same theme tokens as the dashboard, including its calendar, legend and summary cards. Error, warning, and over-target states retain their semantic warm colors. The generic offline page and PWA theme colors use this palette too.

## Illustrations

The editable SVG originals use cobalt clothing and ceramics, a cream apron with a butter pocket, and charcoal details. Skin, tomatoes and vegetables retain natural colors. Avatars use matching blue clothing with butter or pale-blue backgrounds.

The app uses lightweight `*-animated.svg` variants. The cook's spoon stirs slightly, a heart lifts, and decorative sparkles twinkle; the salad's chopsticks tilt with a small sparkle. Each animation plays twice over four seconds, then settles. All motion is inside `prefers-reduced-motion: no-preference`, so reduced-motion users see the complete static artwork. No animation library, timers, React state or nutrition logic is added. The static source SVGs remain available for editing and reuse.

## Layout and hierarchy

`app/layout-spacing.css` owns the main responsive layout and spacing. Superseded dashboard geometry has been removed from `app/style.css` so old breakpoint overrides do not compete with these rules.

- Spacing scale: 4, 8, 12, 16, 24 and 32 px. Section gaps are 24 px, or 20 px on phones. Card padding is 20–28 px; page gutters are 16–48 px.
- Reading order: daily energy, macros, meal journal, then sugar/sodium details and optional insights. Dashboard sections use h2 beneath the page's h1.
- Desktop: energy and macros lead, with the welcome illustration as a supporting third card. At 1100 px and below, the two data cards own the first row; phones stack them.
- Cook and salad illustrations occupy normal grid cells with explicit image dimensions. Copy, artwork and footers cannot occupy the same space.
- Meal text can wrap. Action buttons, weight values and date controls retain their own space. Form helper text stays in normal flow.
- Overview, forms and the Settings connection card use aligned containers and the same card spacing.
- Verify 375, 768, 1024 and 1440 px, including long meal/profile names and over-goal nutrient values.

The shared Dashboard now uses `app/household-dashboard.css`: two equal profile cards, independent daily targets, then a paired data-coverage section, diaries and reflections. The Dashboard header displays both names rather than a profile toggle. At 700 px and below the cards stack. Coverage bars encode known entry counts, not nutrient intake or accuracy; partial nutrient sums explicitly say they are only the known amount. Source counts and expandable missing-value lists support inspection. Illustrations occupy reserved space in section headings.

## Shared rules

The Dashboard reflection uses `app/nutrition-analysis.css`: a cream card with a cobalt action, then an inline result with consumed/target values, numbered observations and one soft-blue next step. Guided question buttons reveal another focused analysis in the same card. Below 900 px, observations stack in reading order; phone metrics use two columns. Loading, retry and empty-day states stay in normal flow. The selected person/date remain visible, and changing analysis inputs clears the old result. No floating chat panel or new animation is needed.

- Manrope and Noto Sans Thai; bold, rounded headings with quieter labels.
- Hierarchy: daily energy, macros, meal journal. BMR and TDEE are supporting information.
- Original editable SVG illustrations.
- No fabricated nutrition, meals or progress.
- Macro plan cards show Moderate Carb (P/C/F 30/35/35), Lower Carb (40/20/40) and Higher Carb (30/50/20), all based on the selected calorie goal. The saved plan feeds the Dashboard. These are selectable presets, not a claim of a universally optimal diet.
- Responsive grids, native date picker, accessible dialogs, visible keyboard focus and reduced motion.
- Theme changes apply to navigation, profiles, all pages, forms, dialogs and sign-in.
