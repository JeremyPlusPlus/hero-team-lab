# Independent Ninja synergy screenshot audit

All three Ninja screenshots were read independently against the frozen `spreadsheet-reference.json`. They contain 16 groups and 43 owner-specific effects. Every partner group matches the reference. Rank minima remain 15, 50, 100, 150, 250, 500, 1000, and 1500 for tiers II through IX; tier I has no displayed minimum. The separately transcribed `batch-02.json` agrees with this audit's 43 observed values, types, scopes, and signs.

The three originals are archived by the transcription workflow as `images/ninja-01.png`, `images/ninja-02.png`, and `images/ninja-03.png`. This audit modifies only this report, not observations, source data, or active calculations.

## Context and numerical model

The nine Grand Masters, global bonuses, hero bonuses, and Snow Fort settings are **inferred continuation** of the preceding Militia capture context, not independently visible in these images. Ninja and partner tile states are unspecified. The model without an additional tile modifier is:

`display magnitude = round(abs(reference base) × 1.05^3 × owner factor × 1.1^9 × tier factor)`

Ordinary owners use 1.25; Warden uses 1.0. Tier factors are 6.25 for I–II, 2.5 for III–IV, 2.15 for V–VI, 1.77 for VII, and 1 for VIII–IX. The ordinary-owner common scale is `S = 3.412023994742347`.

**37 of 43 reference magnitudes match**, including **all 16 Ninja effects**. This count compares magnitudes separately from type and scope: Rogue tier VII retains a compatible magnitude but changes effect type. Matching rows constrain the common scale to **[3.412015503876, 3.412038303694)**. The lower bound comes from Ninja tier VI, base 600 displayed as 4402. The upper bound comes from Gladiator tier VI, base 4250 displayed as 31177. The known-component scale lies inside this tighter interval.

This agreement strongly supports continuation of the known scaling model. It does not independently establish actual deployment count, unchanged account settings, tile locations, or a unique base for every effect.

## Directly verified field corrections

| Owner / tier | Frozen reference | Screenshot | Evidence |
| --- | --- | --- | --- |
| Sorcerer / I | Personal Crit Chance | **Global** Crit Chance | Scope label explicitly global |
| Witch / I | Personal Crit Damage | **Global** Crit Damage | Scope label explicitly global |
| Rogue / II | Positive stored Skill Cooldown magnitude | **−320%** personal Skill Cooldown | Explicit negative sign; normalize direction |
| Peacekeeper / IV | Global Super Gold Amount | Global **Super Exp Amount** | Explicit effect label |
| Warlock / VI | Personal Kill Gold | **Global** Kill Gold | Scope label explicitly global |
| Rogue / VII | Personal Skill Duration | Personal **Skill Power** | Explicit effect label, flat unit |

Ninja tier II remains flat personal **Skill Duration**, not Skill Power. Arbalest tier VII explicitly remains **global Super Energy Amount**. Assassin tier VII explicitly remains **global Ultra Boss Damage**. All other effect types and scopes match the reference.

## Conditional magnitude calibration and implementation decision

| Owner / tier | Old base | Old-base prediction | Observed | Sole integer-base candidate under this model |
| --- | ---: | ---: | ---: | ---: |
| Sorcerer / I, Crit Chance | 10 | 213 | 85 | 4 |
| Witch / I, Crit Damage | 50 | 1066 | 427 | 20 |
| Berserker / II, Skill Power | 5 | 107 | 128 | 6 |
| Rogue / III, Rank Exp | 25 | 213 | 299 | 35 |
| Peacekeeper / IV, new Super Exp Amount | 500 for a different effect | 4265 | 60 | 7 |
| Warlock / VI, Kill Gold | 600 | 4402 | 2017 | 275 |

These six candidates reproduce the displays and are the sole whole-number bases permitted by nearest-integer rounding under the stated model. They are inferred, not directly observed game bases. The implementation decision is to use all six with the status **`inferred-calibrated`**, paired with their verified type/scope corrections. This decision assumes continuation of the same account/map/nine-Grand-Master context, unchanged ordinary-owner +25% strength, no additional tile modifier in the displayed values, and whole-number unmodified bases. All 16 Ninja effects agreeing with that context supports the inference.

An unreported owner-specific or effect-specific modifier could still be numerically indistinguishable from a changed base in one capture. Preserve the original observations, reference values, assumptions, and inferred status so the candidates can be revised if new evidence contradicts them. The earlier Militia-capture exceptions—Peacekeeper tier II Skill Power and Arbalest tier VII Power Mage Energy—remain unresolved; this decision does not activate or resolve those separate records.

**Do not carry Peacekeeper's old base 500 into the new Super Exp Amount label.** It belongs to a different effect. Similarly, activating the new global scopes for Sorcerer, Witch, and Warlock while retaining their old larger magnitudes would overstate the screenshot-supported global contributions. Pairing the six inferred magnitudes with the six directly verified type/scope/sign corrections avoids that inconsistency. The separate activation workflow owns those data changes; this audit writes only its report.

## Warden and shared-group checks

Warden tier VIII is **+33 flat global Skill Power**, with rank badge 2291. Its old base 12 requires the previously stated owner bonus of 0%:

`12 × (S / 1.25) = 32.755430349526534 → 33`.

An ordinary +25% owner factor would instead predict 41. This record therefore agrees with the exceptional owner setting without requiring a base change.

The tier IX Ninja–Militia–Arbalest–Captain group exactly reproduces the earlier Militia capture: Ninja +51 global Energy Income, Militia +256% global Ultra Energy Amount, Arbalest +136 flat personal Skill Power, and Captain +256% global Attack Speed. Their respective reference bases 15, 75, 40, and 75 predict 51.18036, 255.90180, 136.48096, and 255.90180 before rounding. There is no conflicting duplicate observation.

## Complete 43-effect comparison

Predictions below use the frozen magnitude and known-component model. Cooldown prediction is shown with the observed reduction direction; the frozen source stores its magnitude as positive. A magnitude match alone does not imply the old type or scope is correct.

| Owner | Tier / index | Observed effect and scope | Old base | Predicted | Observed | Difference | Sheet source |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Ninja | 1 / 1 | Damage, personal, percent | 25 | 533 | 533 | matches | Data!C8:F8 |
| Assassin | 1 / 1 | Crit Chance, personal, percent | 5 | 107 | 107 | matches | Data!C11:F11 |
| Ninja | 1 / 2 | Crit Damage, personal, percent | 50 | 1066 | 1066 | matches | Data!G8:K8 |
| Sorcerer | 1 / 2 | Crit Chance, global, percent | 10 | 213 | 85 | magnitude, scope | Data!G9:K9 |
| Witch | 1 / 2 | Crit Damage, global, percent | 50 | 1066 | 427 | magnitude, scope | Data!G12:K12 |
| Ninja | 2 / 3 | Crit Chance, global, percent | 8 | 171 | 171 | matches | Data!L8:O8 |
| Rogue | 2 / 3 | Skill Cooldown, personal, percent | 15 | -320 | -320 | stored sign | Data!L25:O25 |
| Ninja | 2 / 4 | Skill Duration, personal, flat | 6 | 128 | 128 | matches | Data!P8:T8 |
| Berserker | 2 / 4 | Skill Power, personal, flat | 5 | 107 | 128 | magnitude | Data!P26:T26 |
| Scout | 2 / 4 | Attack Speed, personal, percent | 60 | 1280 | 1280 | matches | Data!P4:T4 |
| Ninja | 3 / 5 | Kill Gold, global, percent | 80 | 682 | 682 | matches | Data!U8:X8 |
| Wizard | 3 / 5 | Rank Exp, global, flat | 20 | 171 | 171 | matches | Data!U15:X15 |
| Ninja | 3 / 6 | Attack Speed, global, percent | 30 | 256 | 256 | matches | Data!Y8:AC8 |
| Archer | 3 / 6 | Crit Damage, personal, percent | 250 | 2133 | 2133 | matches | Data!Y13:AC13 |
| Rogue | 3 / 6 | Rank Exp, global, flat | 25 | 213 | 299 | magnitude | Data!Y25:AC25 |
| Ninja | 4 / 7 | Damage, global, percent | 125 | 1066 | 1066 | matches | Data!AD8:AG8 |
| Praetorian | 4 / 7 | Energy Income, global, flat | 1 | 9 | 9 | matches | Data!AD38:AG38 |
| Ninja | 4 / 8 | Super Exp Chance, global, percent | 4 | 34 | 34 | matches | Data!AH8:AL8 |
| Peacekeeper | 4 / 8 | Super Exp Amount, global, percent | 500 | 4265 | 60 | magnitude, type | Data!AH14:AL14 |
| Spelldancer | 4 / 8 | Super Exp Chance, global, percent | 4 | 34 | 34 | matches | Data!AH24:AL24 |
| Ninja | 5 / 9 | Skill Power, global, flat | 3 | 22 | 22 | matches | Data!AM8:AP8 |
| Ranger | 5 / 9 | Super Gold Chance, global, percent | 8 | 59 | 59 | matches | Data!AM16:AP16 |
| Ninja | 5 / 10 | Super Energy Chance, global, percent | 4 | 29 | 29 | matches | Data!AQ8:AU8 |
| Chieftain | 5 / 10 | Super Exp Chance, global, percent | 7 | 51 | 51 | matches | Data!AQ29:AU29 |
| Veteran | 5 / 10 | Super Exp Chance, global, percent | 7 | 51 | 51 | matches | Data!AQ43:AU43 |
| Ninja | 6 / 11 | Ultra Gold Chance, global, percent | 2 | 15 | 15 | matches | Data!AV8:AY8 |
| Apprentice | 6 / 11 | Skill Power, global, flat | 5 | 37 | 37 | matches | Data!AV3:AY3 |
| Ninja | 6 / 12 | Kill Gold, personal, percent | 600 | 4402 | 4402 | matches | Data!AZ8:BD8 |
| Gladiator | 6 / 12 | Ultra Crit Damage, personal, percent | 4250 | 31177 | 31177 | matches | Data!AZ23:BD23 |
| Warlock | 6 / 12 | Kill Gold, global, percent | 600 | 4402 | 2017 | magnitude, scope | Data!AZ30:BD30 |
| Ninja | 7 / 13 | Super Energy Chance, global, percent | 5 | 30 | 30 | matches | Data!BE8:BH8 |
| Arbalest | 7 / 13 | Super Energy Amount, global, percent | 15 | 91 | 91 | matches | Data!BE19:BH19 |
| Ninja | 7 / 14 | Super Gold Chance, global, percent | 14 | 85 | 85 | matches | Data!BI8:BM8 |
| Assassin | 7 / 14 | Ultra Boss Damage, global, percent | 1600 | 9663 | 9663 | matches | Data!BI11:BM11 |
| Rogue | 7 / 14 | Skill Power, personal, flat | 20 | 121 | 121 | type | Data!BI25:BM25 |
| Ninja | 8 / 15 | Boss Gold, personal, percent | 2250 | 7677 | 7677 | matches | Data!BN8:BS8 |
| Assassin | 8 / 15 | Ultra Crit Damage, global, percent | 3000 | 10236 | 10236 | matches | Data!BN11:BS11 |
| Elementalist | 8 / 15 | Ultra Gold Amount, global, percent | 3000 | 10236 | 10236 | matches | Data!BN18:BS18 |
| Warden | 8 / 15 | Skill Power, global, flat | 12 | 33 | 33 | matches | Data!BN37:BS37 |
| Ninja | 9 / 16 | Energy Income, global, flat | 15 | 51 | 51 | matches | Data!BT8:BY8 |
| Militia | 9 / 16 | Ultra Energy Amount, global, percent | 75 | 256 | 256 | matches | Data!BT2:BY2 |
| Arbalest | 9 / 16 | Skill Power, personal, flat | 40 | 136 | 136 | matches | Data!BT19:BY19 |
| Captain | 9 / 16 | Attack Speed, global, percent | 75 | 256 | 256 | matches | Data!BT34:BY34 |
