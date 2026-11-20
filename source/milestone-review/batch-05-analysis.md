# Batch 05 and milestone activation

Recorded November 2, 2026. This batch adds Necromancer, Warden, Praetorian, Sovereign, Deadeye, Titan, Dicemaster, and Veteran: **136 milestones**, bringing the total to **42 heroes / 714 milestones**. All 42 heroes in the original spreadsheet now have complete screenshot coverage through level 10,000. The remaining 18 heroes in the user's stated roster await data.

Every batch-05 effect's signed value, stat, scope, unit, and each hero's base-stat display were independently checked against the images. Sovereign level 3,000 explicitly says **Ultra Exp Amount, global**, resolving the original ambiguous label. Eight flat values differ from the old sheet after scaling: Necromancer 750 Rank Exp and 1,000 Skill Power; Praetorian 250 Rank Exp and 2,000 Skill Power; Deadeye 1,000 Skill Power; Titan 500 Skill Power; Dicemaster 2,500 Skill Power; Veteran 1,500 Skill Power.

## Confirmed account context

The user identified the previously missing **+50% milestone bonus from each hero's Ascension points**. With the already reported +50% talent bonus and +25% global modifier, the account context is:

`1.5 × 1.25 × 1.5 = 2.8125`.

No heroes were deployed for the screenshots. Ascension is an owner bonus applied once, not a factor compounded across deployed heroes. These milestone-only permanent bonuses do not apply to synergies.

## Normalization and application

For displayed magnitude `d`, the possible base magnitude is in `[(d - 0.5) / 2.8125, (d + 0.5) / 2.8125)`, assuming nearest-integer display rounding. Every one of the 714 observations admits exactly one nonnegative integer base and rounds back to its observed display. The active records use these inferred bases, restore negative cooldown signs, and preserve the screenshot values, units, sources, and normalization context. Whole-number base values are an explicit modeling assumption; screenshots do not reveal unrounded internal numbers.

Each effective milestone uses:

`signed base × permanent milestone scale × (Grand Master pool + owner's milestone tile bonus)`.

With ten Grand Masters and a milestone tile this is `base × 2.8125 × 2.2 = base × 6.1875`. Effective values retain fractions. Both detailed evaluation and the optimizer's compiled scorer use the same scale. A manual permanent multiplier defaults to 2.8125, including when importing an older setup without this setting.

Captain's level-7,500 Power Mage Energy is flagged despite its inferred base of 10: the old base was 15, and a stat-specific scaling exemption cannot be ruled out. That effect is visible but unscored. This batch adds no second percentage exception once the Excel-unit issue below is corrected.

## Veteran's source-unit correction

Original workbook `Data!DS43` contains numeric `0.05` with number format `0%`. This is **5%**. It is the only fractional milestone value in the original source milestone range. The review preserves the raw value in its frozen reference, compares using 5 percentage points, and records the correction in `source-unit-corrections.json`. At ×2.8125 it displays +14%, matching Veteran's level-7,500 Instant Trainee. It is not a balance-change inference.

## New level-10,000 observations

| Hero | Displayed bonus | Scope | Inferred signed base |
| --- | --- | --- | ---: |
| Necromancer | +422% Damage | Global | 150 |
| Warden | +56% Ultra Crit Chance | Personal | 20 |
| Praetorian | +984% Damage | Personal | 350 |
| Sovereign | +84 Skill Power (flat) | Personal | 30 |
| Deadeye | +984% Damage | Personal | 350 |
| Titan | +23% Ultra Crit Chance | Global | 8 |
| Dicemaster | +42% Super Crit Chance | Global | 15 |
| Veteran | +23% Ultra Exp Chance | Global | 8 |

The source extractor now reapplies confirmed screenshot milestones during regeneration. Original synergies are preserved and remain unverified against current game screenshots. Named instant-skill effects remain visible but unscored. The Experience index uses an explicit assumed base payout of 100 rank XP; the added Rank Exp milestone values are flat, not percentages.
