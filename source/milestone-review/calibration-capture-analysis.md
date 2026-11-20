# Militia milestone calibration with nine Grand Masters

The screenshot in `images/militia-nine-grand-masters.png` was independently read and archived byte-for-byte. The user stated that nine Grand Masters were deployed. It shows 17 milestone entries from level 25 through 10,000. Their types, scopes, units, and signs all match the active inferred Militia bases. The screenshot is a separate calibration capture, not a duplicate hero-ingestion batch.

The original milestone ingestion screenshots remain a **zero-deployment** baseline. Their previously confirmed permanent account multiplier is `1.5 × 1.25 × 1.5 = 2.8125`; no Grand Master or placement strength is included in those base inferences.

## Multiplier comparison

| Model | Total multiplier | Matching displayed milestones |
| --- | ---: | ---: |
| Permanent baseline × compounded Grand Masters: `2.8125 × 1.1^9` | 6.631727880937506 | **17/17** |
| Permanent baseline × additive Grand Masters: `2.8125 × 1.9` | 5.34375 | **0/17** |
| Compounded model with the three synergy-only +5% bonuses incorrectly included | 7.677053988170281 | **0/17** |

Compounded Grand Master **milestone** strength is therefore strongly supported by this independent capture. This supersedes the earlier additive interpretation. The user confirmed the deployed count and bonus components; the stacking rule is inferred from their joint agreement with the observed values.

The synergy-only `1.05³` factor is absent from the matching milestone formula. It must not be copied from synergy calibration into milestone calculations.

## Rounding evidence

Predictions use the active screenshot-inferred bases, multiplied before nearest-integer display rounding. Signs are retained for cooldown reduction.

| Level | Effect | Inferred base | Raw compounded result | Screenshot | Additive prediction |
| --- | --- | ---: | ---: | ---: | ---: |
| 500 | Global Rank Exp, flat | 8 | 53.053823048 | +53 | +43 |
| 1,000 | Personal Skill Cooldown | −16 | −106.107646095 | −106% | −86% |
| 2,000 | Global Super Crit Chance | 4 | 26.526911524 | +27% | +21% |
| 3,500 | Global Ultra Exp Amount | 15 | 99.475918214 | +99% | +80% |
| 7,500 | Personal Ultra Crit Damage | 300 | 1,989.518364281 | +1,990% | +1,603% |
| 10,000 | Personal Super Crit Damage | 350 | 2,321.104758328 | +2,321% | +1,870% |

All 17 entries constrain a shared total scale to **[6.631666666667, 6.632857142857)** under the inferred-base and nearest-integer assumptions. The lower bound comes from level 7,500, the upper bound from level 10,000. The supplied-components result lies inside this interval.

## Limits and reproduction

Militia's milestone-tile activation was not supplied for this capture. A formula without an additional tile effect fits every value; that does **not** independently prove its physical placement or establish how tile strength combines with compounded Grand Masters. No tile interaction is activated or validated by this evidence audit.

This comparison checks previously inferred bases; it does not directly observe unmodified game values or prove that every other hero and named skill follows the same rules. No hero bases, active data, engine settings, or application code are changed here.

`calibration-capture-militia-nine-grand-masters.json` preserves the transcription and capture-specific context. Run `python source/milestone-review/compare_calibration_captures.py` to archive/verify the image and regenerate `calibration-captures-review.json` and `calibration-captures-comparison.csv` against the current active inferred bases. `build_review.py` also invokes that audit and includes the separate evidence in `review.json`, while keeping coverage at 42 unique heroes and 714 ingestion milestones.
