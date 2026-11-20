> Historical first-capture analysis. Later batches21–22 activate conditional Peacekeeper base5 and equivalent Arbalest base12 under the standard owner model, reproducing the earlier values too. Arbalest base15 without an owner multiplier remains indistinguishable; Power Mage Energy remains unscored. See the current README and confirmed-overrides.json.

# Militia synergy screenshot audit

Three screenshots cover 16 unique groups and 43 owner-specific effects, including all 16 Militia effects. All partner groups and personal/global scopes match the frozen spreadsheet reference. The screenshots supply rank minima for tiers II–IX: 15, 50, 100, 150, 250, 500, 1000, and 1500. Tier I has no rank requirement label.

## Confirmed capture context

Nine Grand Masters were deployed. Militia was **not** on a synergy tile. Other owners' tiles are unspecified. Snow Fort adds +115% to tiers V–VI and +77% to tier VII. The user additionally confirmed +25% and +400% bonuses for tiers I–II, +150% for tiers III–IV, a hero-specific +25% synergy bonus except Crusader (+15%) and Warden (+0%), and **three independent global synergy bonuses of +5% each**.

Multiplying the two early-tier bonuses gives 1.25 × 5 = 6.25. The following model fits the screenshot data:

`display magnitude = round(old base magnitude × S × tier factor × relative owner factor)`

| Tier | Tier factor | Rank minimum shown |
| --- | ---: | ---: |
| I | 6.25 | Not specified |
| II | 6.25 | 15 |
| III | 2.5 | 50 |
| IV | 2.5 | 100 |
| V | 2.15 | 150 |
| VI | 2.15 | 250 |
| VII | 1.77 | 500 |
| VIII | 1 | 1,000 |
| IX | 1 | 1,500 |

Relative owner factors are 1 for ordinary heroes, 1.15/1.25 = 0.92 for Crusader, and 1/1.25 = 0.8 for Warden. `S` already contains the ordinary owner's 1.25 factor, global synergy bonuses, and deployed Grand Master effects; these must not be applied again to the fitted total.

## Numerical fit and limits

**41 of 43 effects**, including **all 16 Militia effects**, fit the original base magnitudes with a common scale in **[3.412015503876, 3.412166666667)**. The lower bound comes from Militia and Titan tier VI: base 600 must round to 4,402 after the tier factor of 2.15. The upper bound comes from Sorcerer tier VIII: base 3,000 must round to 10,236.

The newly supplied components reproduce those 41 observations without fitting an unexplained account multiplier:

`S = 1.05 × 1.05 × 1.05 × 1.25 × 1.1^9 = 3.412023994742347`

The independent global bonuses contribute ×1.157625. Nine independently compounded Grand Master synergy bonuses contribute ×2.357947691. The resulting scale lies inside the empirical interval. **Compounded Grand Master stacking is a strongly supported inference for synergy strength**, based on user-confirmed bonus components and the observed values. The user confirmed the components; this numerical fit supplies the stacking inference.

Using the same components but additive Grand Masters gives `1.05^3 × 1.25 × 1.9 = 2.749359375` and matches **0 of 43 effects**. The earlier residual estimate near ×1.43667 assumed additive Grand Masters; it is superseded by the supplied-component explanation and should not be added as another modifier.

| Effect | Raw value with compounded Grand Masters | Rounded prediction | Screenshot | Additive Grand Master prediction |
| --- | ---: | ---: | ---: | ---: |
| Militia, tier II Kill Gold | 2,132.514996714 | 2,133 | 2,133 | 1,718 |
| Militia, tier III Crit Chance | 136.480959790 | 136 | 136 | 110 |
| Militia, tier VI Damage | 4,401.510953218 | 4,402 | 4,402 | 3,547 |
| Archer, tier VI Ultra Crit Damage | 16,505.666074566 | 16,506 | 16,506 | 13,300 |
| Sorcerer, tier VIII Ultra Crit Damage | 10,236.071984227 | 10,236 | 10,236 | 8,248 |

The earlier milestone scale of 2.8125 has no role in this synergy calculation. Nor does 3.4125 reproduce all observed synergy values. Milestone stacking was left additive at the time of this synergy audit; a subsequent, separate Militia milestone screenshot with nine Grand Masters supports compounded milestone stacking as well (17/17 values match). See `../milestone-review` for that evidence. The synergy-only +5% modifiers remain excluded from milestones.

The tile bonus remains explicitly modeled as +0.10 added to the Grand Master synergy-strength factor, with the global, owner, and tier factors applied separately. Its interaction with the newly inferred compounded Grand Master factor is **unverified**: Militia was off a synergy tile. These screenshots therefore do not establish an on-tile formula or the other owners' placement states.

The hero-specific differences explain two otherwise apparent balance changes: Crusader tier IV's old base 4 gives 31.390620752, rounding to 31 after its 0.92 adjustment; Warden tier VI's old base 5 gives 29.343406355, rounding to 29 after its 0.8 adjustment.

Two exceptions remain:

| Effect | Old base | Display | Conditional explanation |
| --- | ---: | ---: | --- |
| Peacekeeper, tier II, personal Skill Power | 3 | +107 | Base 5 fits the shared scale; old base 3 predicts 64. Could also be a stat-specific modifier. |
| Arbalest, tier VII, global Power Mage Energy | 15 | +72% | Base 12 fits. Keeping base 15 but excluding the owner's ×1.25 bonus also fits. These explanations are indistinguishable here. |

These candidate base changes remain unactivated. Power Mage Energy is a named skill effect excluded from focus scoring. The fit still assumes unchanged spreadsheet magnitudes and nearest-integer display rounding; matching displays do not prove unique base values. The two exceptions cannot be resolved from this capture alone.

## Applied evidence independent of calibration

Crusader tier IV and Arbalest tier V explicitly grant **global Super Energy Amount**, superseding the generic interpretation of the old sheet's bare `Super Energy` label as chance for these two records. Militia tier I's personal Skill Cooldown has a negative sign. The tool applies these two type corrections and one sign correction, preserving the old magnitudes pending calibration. Other bare `Super Energy` records retain their previously selected interpretation until directly reviewed.

For implementation, preserve independent stages for the three global bonuses, hero-specific bonus, Grand Master synergy strength, and tier factors. Snow Fort applies only its stated tiers. The fitted total must not become a new base value or another bonus on top of its components. This audit updates evidence artifacts only; it does not modify engine code, UI, or candidate base values.

## Reproduction

`batch-01.json` preserves exact observations; `images` holds byte-for-byte originals; `spreadsheet-reference.json` preserves original synergy records. `calibration.json` separates user-confirmed components from inferred stacking and unverified tile interaction. Run `python source/synergy-review/build_review.py` for the combined `comparison.csv` and machine-readable `review.json`, including both compounded and additive Grand Master predictions. Run `python source/synergy-review/apply_verified.py` to apply reviewed fields and explicitly listed inferred bases, then `node build.cjs` to rebuild the local HTML.


## Subsequent Ninja capture

`batch-02.json` adds 43 observations in 16 groups, four observations of one group overlapping this Militia batch exactly. Together there are 82 unique effects in 31 groups. The Ninja audit is documented separately in `ninja-analysis.md`; it confirms all 16 Ninja-owned magnitudes under the continuing profile and applies six paired integer-base inferences with directly observed type/scope/sign changes. The two exceptions described above remain unresolved and unchanged. Combined frozen-source comparison now matches 78/86 observations (74/82 unique); corrected active records match 84/86 (80/82 unique). The summary above describes the original Militia batch, not the later corrected dataset.
