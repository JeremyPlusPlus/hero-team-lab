# Batch 01: milestone evidence and normalization review

Current calibration update: the historical review below predates confirmation of the full permanent baseline and later activation. The original ingestion context remains **zero deployed heroes, account multiplier 2.8125**. A distinct nine-Grand-Master Militia capture now supports **compounded milestone strength**, `2.8125 × 1.1^9`, with 17/17 displayed values matching and 0/17 matching additive Grand Masters. See [the deployed-team calibration audit](calibration-capture-analysis.md). This update does not renormalize hero bases or establish tile stacking.

Reviewed on 2026-11-02. This is an evidence review, not an update to the active calculator dataset.

## Evidence and coverage

The eight original screenshots were visually inspected independently. The records in `batch-01-a.json` and `batch-01-b.json` contain 17 visible milestones for each of Militia, Apprentice, Scout, Viking, Druid, Hunter, Ninja and Sorcerer: **136 observed records**. Each screenshot reaches level 10,000. The corresponding active `data.js` records have 16 milestones each, ending at 7,500: **128 old records**.

Keep displayed magnitudes, signed values, units, types, scopes and source-image identities as observed evidence. They are not automatically unmodified base bonuses. The screenshots show the hero information page rather than a visible statement of the active milestone-strength calculation.

## Shared percentage scaling

For a positive unchanged base bonus `b`, displayed integer `d`, and nearest-integer rounding, a shared scale `s` must satisfy:

`(d - 0.5) / b <= s < (d + 0.5) / b`.

Across **98 existing percentage entries with the same effect type**, the intervals intersect at:

**`2.8125 <= s < 2.814`**.

The lower bound comes from Apprentice level 150, old base 8 Crit Chance displayed as 23. The upper bound comes from Hunter level 6,000, old base 250 Super Gold Amount displayed as 703. Militia level 7,500, 300 Ultra Crit Damage displayed as 844, also provides a strong constraint. All 98 percentage entries reproduce their displayed values using `Math.round(oldBase * 2.8125)`.

The exact value **2.8125 is consistent, but is not uniquely proven** by integer displays. Endpoint inclusion assumes positive half-up/half-away rounding; an unknown tie policy is another reason to retain the scale as a hypothesis. Uniform floor or ceiling rounding cannot explain these 98 rows while holding the old bases unchanged: their intersections are empty (`floor: [3, 2.816)`, `ceil: (2.81, 2.6666667]`).

These observations support a common scaling explanation for the percentage rows. The user subsequently confirmed that the screenshots were taken with **zero heroes deployed**, so they represent the account baseline without deployed Grand Master or placement effects. Known permanent bonuses are +50% from talents and another +25% global modifier. If those two independent modifiers multiply, they give `1.5 × 1.25 = 1.875`; reaching the consistent candidate scale 2.8125 would require another factor of 1.5. If they add, the two known bonuses give 1.75 instead. The observed scale's full account decomposition remains unresolved; a missing factor must not be invented or assigned a source. A screenshot taken with changed account settings could require a separate normalization context.

Of **127 old rows whose effect type is unchanged**, 113 reproduce their displayed values at the candidate scale. The remaining 14 are flat Skill Power or Rank Exp rows. The single old row whose type changed is excluded from that 127-row comparison.

## Direct type and scope changes

These differences are visible independently of numeric normalization:

| Hero | Level | Old dataset | Current screenshot |
| --- | ---: | --- | --- |
| Militia | 5,000 | Super Gold Amount, global | Ultra Energy Chance, global, displayed +6% |
| Hunter | 7,500 | Instant Skill Chance, global | Instant Skill Chance, personal, displayed +28% |

No other effect-type or scope differences were found in the overlapping 128 rows. All eight heroes have an additional level-10,000 effect.

The screenshots explicitly omit the percent sign for **Rank Exp, Skill Power, Skill Duration and Energy Income**. They show negative percentages for Skill Cooldown. The old source stores cooldown reduction magnitudes as positive numbers; this is a storage convention, not evidence that the new screenshots changed the direction of that effect. Retain both magnitude and signed display value.

The active calculator currently interprets Rank Exp as a percentage in its experience index. The screenshot evidence instead labels Rank Exp as flat. Its exact relationship to the base rank-experience payout needs calibration; importing it as a percentage would not follow the observed unit. This is a scoring-model concern separate from screenshot normalization.

## Flat rows that the common-scale hypothesis does not reproduce

The final column is an **integer-base candidate**, conditional on the shared scale and an integer base domain. It is not an observed base value. These may reflect game-data changes or account/effect-specific behavior and must not be silently promoted to verified base bonuses.

| Hero | Level | Effect | Old base | Displayed | Rounded old base ×2.8125 | Candidate integer base |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Militia | 500 | Rank Exp | 5 | 23 | 14 | 8 |
| Militia | 750 | Skill Power | 2 | 8 | 6 | 3 |
| Apprentice | 250 | Skill Power | 1 | 6 | 3 | 2 |
| Scout | 500 | Skill Power | 2 | 8 | 6 | 3 |
| Scout | 750 | Skill Power | 2 | 8 | 6 | 3 |
| Viking | 500 | Skill Power | 2 | 8 | 6 | 3 |
| Druid | 750 | Skill Power | 2 | 8 | 6 | 3 |
| Druid | 1,000 | Rank Exp | 8 | 42 | 23 | 15 |
| Hunter | 250 | Skill Power | 1 | 6 | 3 | 2 |
| Hunter | 750 | Rank Exp | 6 | 34 | 17 | 12 |
| Hunter | 2,500 | Skill Power | 5 | 23 | 14 | 8 |
| Ninja | 750 | Rank Exp | 6 | 34 | 17 | 12 |
| Ninja | 1,000 | Skill Power | 3 | 11 | 8 | 4 |
| Sorcerer | 250 | Rank Exp | 4 | 14 | 11 | 5 |

Each candidate integer in this table is the sole integer compatible with the shared-scale interval and nearest-integer display. That does not prove the game uses an integer unmodified base or that a shared scale is valid for these flat effects. Some other rows of the same flat effect types do match the old base, so a blanket extra multiplier for all Skill Power or all Rank Exp would also need supporting evidence.

## Additional level-10,000 effects

| Hero | Effect | Scope | Displayed bonus | Candidate integer base at ×2.8125 |
| --- | --- | --- | ---: | ---: |
| Militia | Super Crit Damage | Personal | +984% | 350 |
| Apprentice | Ultra Crit Damage | Global | +422% | 150 |
| Scout | Super Gold Amount | Global | +422% | 150 |
| Viking | Ultra Crit Damage | Personal | +984% | 350 |
| Druid | Super Crit Damage | Global | +422% | 150 |
| Hunter | Ultra Gold Amount | Global | +422% | 150 |
| Ninja | Ultra Energy Amount | Global | +84% | 30 |
| Sorcerer | Skill Duration | Personal | +28 flat | 10 |

For example, `350 × 2.8125 = 984.375`, `150 × 2.8125 = 421.875`, `30 × 2.8125 = 84.375`, and `10 × 2.8125 = 28.125`. Their rounded displays match. Dividing the display directly by the scale gives a noisy estimate, such as `984 / 2.8125 = 349.8667`; it should not be stored as an exact underlying base.

Militia level 5,000's new +6% Ultra Energy Chance would similarly be compatible with base 2 under this hypothesis. Its former base 75 for a different stat must not be reused.

## Safe ingestion workflow

1. Preserve the screenshot observations and the original spreadsheet dataset separately. Archive image copies in the project because temporary clipboard paths are not durable provenance.
2. Track coverage by hero and observed milestone level. Distinguish `observed`, `base normalization pending`, and `verified base`; unknown values stay null or absent, never zero. Eight heroes observed does not mean all 60 are complete.
3. Record a normalization context per screenshot or confirmed capture batch. For this batch, zero deployed heroes is confirmed, Grand Master/tile inclusion is false, and +50% talent plus another +25% global bonus is known. The full multiplier, rounding policy and any stat-specific adjustments remain unresolved. Do not reconstruct this context from the calculator's current defaults.
4. Store normalized candidates separately from observed values, together with their assumptions and forward-rounding check. Confirmed type/scope corrections can be recorded immediately, but changing the active dataset should not mix old base magnitudes with new displayed magnitudes.
5. Once normalization is established, apply the unmodified bases to the active hero data. The engine can then apply the desired team's Grand Master, map, and tile boosts once. Feeding these displayed bonuses directly through the current scaling would double-count any included effects.
6. Future heroes missing from the 42-hero source should have explicit coverage status. Milestone screenshots do not establish their synergies; do not fabricate missing links or treat unknown synergies as verified zero effects.

## Meaningful validation before activation

- Check all 17 expected levels in these eight images, no duplicate hero/level keys, correct hero identity, explicit units, effect direction, and global/personal scope.
- Forward-round every normalized candidate into the observed display under its recorded capture context. Flag contradictions rather than silently selecting a new scale for each row.
- Test the new level-10,000 unlock at 9,999 versus 10,000. Verify all lower milestones remain cumulative and no 15,000 milestone is invented from a 10,000 screenshot.
- Test Hunter's corrected personal Instant Skill Chance on its owner only, including duplicate copies. Test Militia's changed level-5,000 effect as global energy chance, with no residual Super Gold Amount contribution from that row.
- With Grand Master/map/manual boosts disabled, the engine should expose normalized base effects. With a known boost context enabled, verify owner emission scaling occurs exactly once and global effects are not multiplied again on receipt.
- Resolve the flat Rank Exp model separately before claiming experience rankings are current. A percentage denominator of 100 is not supplied by these screenshots.

## Minimal calculator warning integration (advice only)

Place a persistent data-review note near `#metrics` and `.model-note` in `index.template.html`. Suggested copy while staging: **“Account screenshots captured; original base-value scaling unresolved. Calculations still use spreadsheet data through 7,500.”** Show progress as 8 of 60 heroes captured. Link it to the local review report if available.

Use a separate element, not `#alert`: the app's `edited()` function clears `#alert`, so a data-version warning placed there would disappear after an ordinary input change. Keep the existing `#data-badge` and `#source-description` accurate; neither should claim the screenshots are active until the normalized data actually drives the engine. A short note by the Experience metric should identify the unresolved flat Rank Exp interpretation if that ranking remains enabled.

The review itself leaves active engine and hero data unchanged. A separate requested UI addition displays captured screenshot evidence alongside the original spreadsheet values and keeps the calibration warning visible; it does not feed observed values into the calculator.
