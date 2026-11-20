# Batch 02 independent milestone audit

Reviewed 2026-11-02. Only this report was written; active calculator files were not changed.

## Coverage and transcription verification

Visually inspected the five original screenshots for Forester, Assassin, Witch, Archer and Peacekeeper. Independently checked the resulting `batch-02-a.json` and `batch-02-b.json` records against the screenshots.

Each image has 17 milestones through level 10,000. All **85 records** match the independently recorded displayed magnitudes and signs. Flat-versus-percent units were checked individually. Existing effect types and scopes match the old source after normalizing the Battlepass spelling alias described below; the five new level-10,000 scopes also match the images. No transcription discrepancies were found.

Combined with batch 01, captured coverage is **13 of 60 heroes, 221 milestones**. This is evidence coverage, not activation of new base data in calculator scores.

## Existing rows and scaling

There are 80 old overlapping milestones in this batch. Of those, **76** reproduce their displayed magnitudes using nearest-integer rounding at the provisional scale 2.8125. The remaining four are flat Skill Power values.

All **62 existing percentage entries** fit a shared nearest-integer scale in the interval:

**`2.8125 <= scale < 2.814`**.

This independently matches the batch-01 interval. Across both batches there are therefore **160 existing percentage entries** consistent with that same interval. The exact scale and its permanent-account decomposition remain unresolved; integer display values do not uniquely identify 2.8125.

The user's expression `1 + 1.5 × 1.25` equals **2.875** arithmetically. It is outside the interval compatible with the unchanged percentage bases. For example:

| Existing source row | Displayed | `round(base × 2.8125)` | `round(base × 2.875)` |
| --- | ---: | ---: | ---: |
| Forester level 7,500, base 125 Super Crit Damage | 352 | 352 | 359 |
| Assassin level 6,000, base 250 Damage | 703 | 703 | 719 |
| Peacekeeper level 1,000, base 70 Kill Gold | 197 | 197 | 201 |

Thus 2.875 does not explain these displayed values under the unchanged-base, nearest-rounding hypothesis. That arithmetic observation does not establish an alternative game formula or the source of any missing account modifier. A multiplier of 1.5 conventionally already includes the original 100% plus a 50% bonus; adding another 1 is a different formula and should not be presumed to be the game's rule.

## Flat-value differences

| Hero | Level | Effect | Old base | Displayed | Expected from old base ×2.8125 |
| --- | ---: | --- | ---: | ---: | ---: |
| Witch | 2,500 | Skill Power, personal | 5 | 23 | 14 |
| Archer | 500 | Skill Power, personal | 2 | 8 | 6 |
| Archer | 1,000 | Skill Power, personal | 3 | 11 | 8 |
| Peacekeeper | 1,500 | Skill Power, personal | 3 | 14 | 8 |

If the shared scale also applies to these flat values and bases are integers, the unique compatible candidate bases would be 8, 3, 4 and 5 respectively. These are conditional inferences, not confirmed base values. Game-data changes or effect-specific account behavior remain possible explanations.

Forester and Assassin have no numeric discrepancy among their old 16 rows under the provisional scale. All four flat discrepancies are already represented accurately in the batch transcriptions.

## Types, scopes and units

There are **no substantive type or scope changes** in the 80 overlapping rows.

Peacekeeper level 7,500 is explicitly **“+3 Battlepass Exp (GLOBAL effect)”**, with **no percent sign**. The old source uses `Battle Pass Exp`, value 1, global. Preserve the screenshot's literal spelling in `sourceText`, but treat `Battlepass Exp` and `Battle Pass Exp` as spelling aliases when comparing effect types. This should not create a false `type-change` result. Its displayed value is consistent with `round(1 × 2.8125) = 3`.

Other scope details verified directly include:

- Archer level 7,500 Instant Skill Chance is **personal**, already personal in the old source. It differs from the previous batch's Hunter source-scope correction and must not be changed to global by analogy.
- Assassin level 3,000 Ultra Crit Chance and level 5,000 Skill Cooldown are **personal**; its level 7,500 Ultra Crit Damage is **global**.
- Witch level 4,000 Ultra Crit Chance is **personal**, while level 5,000 Skill Power is **global**.
- Peacekeeper level 1,500 Skill Power is **personal**, and level 3,000 Ultra Crit Damage is **global**.
- Rank Exp, Skill Power, Skill Duration, Energy Income and Battlepass Exp are displayed as flat quantities. Skill Cooldown entries are signed negative percentages; the old sheet's positive magnitude convention should be preserved separately rather than mistaken for a direction change.

## New level-10,000 milestones

| Hero | Screenshot effect | Scope | Observed unit | Conditional integer base at ×2.8125 |
| --- | --- | --- | --- | ---: |
| Forester | +84 Skill Power | Personal | Flat | 30 |
| Assassin | +28 Skill Duration | Personal | Flat | 10 |
| Witch | +422% Ultra Crit Damage | Global | Percent | 150 |
| Archer | +113% Ultra Exp Amount | Global | Percent | 40 |
| Peacekeeper | +984% Ultra Crit Damage | Personal | Percent | 350 |

The candidate column is for audit reasoning only. Active data should retain confirmed unmodified bases only; displayed values must not be treated as bases and then multiplied by Grand Master or placement boosts again.

## Integration checks

1. Normalize the Battlepass spelling for comparison while retaining raw evidence text and flat unit.
2. Expect 85 new captured records and five newly observed level-10,000 milestones; do not replace the 80 old base values with their boosted screenshot displays.
3. Keep the four flat numeric discrepancies separate from structural type/scope changes. This batch has zero substantive structural changes.
4. Recompute combined review coverage as 13 heroes and 221 records. Keep account-baseline and unresolved base-scaling status visible.
5. Preserve the distinction between base stats shown above the milestones and milestone effects. In particular Assassin's displayed base Damage 10, DPS 14 and Attack Speed 1.50/s should be recorded as shown rather than “corrected” by multiplying rounded display fields.

The batch-01 safety and activation checks remain applicable. No additional permission question is required for continuing evidence capture.
