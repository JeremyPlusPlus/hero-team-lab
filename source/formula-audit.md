# Source formula audit

Source: https://docs.google.com/spreadsheets/d/1fhCvf0yoFYqoTic86KpcjGmAFDYv-RHGCAas8sG1B6U/edit?gid=63100333

Downloaded 2026-11-02. The workbook identifies its update as 2025-09-02, game V11.72, updated by Mana, contributors devilkk and Osto (`Introduction!C25:C28`, `D27`). This is a snapshot of that model, not a claim about current game balance.

## Raw source layout

- `Data!A2:A43`: 42 heroes. `DW2:DW43`: base attack speed.
- `Data!C2:BY43`: 16 directional synergy records per hero, including partner names, value, effect type, and global flag. Tiers 1–7 unlock two successive records each; tiers 8 and 9 unlock records 15 and 16 respectively.
- `Data!BZ2:DU43`: 16 milestone triplets (value, effect, global flag), at levels 25, 75, 150, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, and 7500. `BY2:BY43` refers to `DV2:DV43` for final synergy flags.
- A true global flag affects all deployed heroes; false affects the owner only. The source assumes all deployed heroes are in synergy range (`Simulator!G15`).
- Duplicates are supported: the supplied simulator lineup contains two Militias and two Arbalests. Each deployed copy contributes its own eligible milestones and synergies.

## Activation

Each owner needs all partner heroes deployed. Treat owner plus the partner list as a multiset, so repeated requirements need separate copies. Directional records are independently active; reciprocal synergies are not duplicates of one effect.

The user's later rule overrides the source: all heroes need one fewer partner for three-hero and four-hero synergies. Consume the owner copy, count remaining partners as a multiset, then require any one of two listed partners or any two of three listed partners. Two-hero synergies still need their one partner. Source activation formulas do not implement this reduction.

Source activation: `Data!N100` for one partner, `R100` for two, `T100` and `T110` for three. Examples with repeated requirements:

- Sovereign record 15 requires three Crusaders.
- Crusader record 15 requires Sovereign and two additional Crusaders (three Crusaders total including the owner).
- Warlord and Titan record 16 require two Warlocks; Warlock's equivalent requires one other Warlock.
- Scout and Sniper record 16 require two Templars; Templar's equivalent requires one other Templar.

Global synergy values are rounded to integers after applying synergy effect scale (`Data!N100`, `R100`, `T100`). Source scale is defined in `Simulator!J5:J14` using research, tech, stances and event settings. Without these optional systems, a scale of 1 preserves raw values. The event changes milestone values to `ROUND(value*1.25)` (`Data!G80`, `X135`); this need not be applied in a bonus-only model without event controls.

## Stacking and scoring

Use independent factors `PRODUCT(1 + value/100)` for Damage, Attack Speed, Crit Damage, Super Crit Damage, Ultra Crit Damage, Kill Gold, Super Gold Amount, Ultra Gold Amount, Super Energy Amount, Ultra Energy Amount, Super Exp Amount, Ultra Exp Amount, Boss Exp, and Ultra Boss Damage. Verified in `Data!AB82:AJ96` and `AB134:AE142`.

Use additive totals for Energy Income, Rank Exp, Skill Power, and chance percentages. Chance units should be percentage points throughout; the source inconsistently divides some chance totals by 100 or erroneously multiplies them.

Suggested transparent normalized bonus scores, excluding stances/maps/attributes and absolute hero base damage:

- Damage: damage factor × attack-speed factor × crit-damage factor × super-crit-damage factor × ultra-crit-damage factor × shared critical-chance spillover factor.
- Gold: final kill-gold factor × boss-gold factor × super-gold factor × ultra-gold factor × chance spillover, plus the selected Crusader’s separate generated-gold payout described below.
- Rank experience: `(1 + summed Rank Exp / 100)` × super-exp factor × ultra-exp factor, subject to resource proc assumptions. There is no generic ordinary Exp effect in the data.
- Energy: `(base energy income + summed Energy Income)` × super-energy factor × ultra-energy factor, subject to resource proc assumptions. The sheet's neutral-map base is 1 (`Simulator!O5`).

The source merely displays resource chance totals and amount factors; it does not define expected resource yield. The user subsequently confirmed that all gold, energy, and experience Super/Ultra chances are also capped at 100%, as well as critical tiers. The tool therefore uses guaranteed amount factors and one additive chance spillover pool for each focus (damage, gold, energy, experience).

The user's one shared spillover modifier is an intentional extension, not a source formula. Under a 1 percentage point → +5% conversion, 20 points total yields one 2.0× factor, not twenty factors of 1.05. Existing external spillover can reduce the relative improvement, so a baseline overflow input makes comparisons more useful.

### Hero ascensions

The November 19 ascension screen and installed Windows build 26703178 distinguish personal ranks from global upgrades emitted by a deployed hero. `cq.bmy` multiplies a global factor for every active copy. At rank `n`, progressive Damage and Kill Gold each use `1 + n(n+1)/2`. Global Rank EXP and Energy Income use `1 + n/100`. Personal Damage and Kill Gold use `5^n`. The personal attack cap is `10 + n` attacks/s (`cl.bki`) and the cooldown floor is `1 − 0.25n` seconds (`cl.blh`). The timed Immortal calculation applies those limits to its configured inputs. Speed above the owner’s cap adds 10% per excess attack/s to real-hit damage in `cl.bkg`. Free Hero Level Chance applies to buying run levels, outside the fixed-level reward calculation.

### Mimic farming and hourly Gold

The November 19 account screenshots show +67% Mimic Spawn Chance, +340% Mimic Gold Bonus, +912% displayed Wave Boss Gold and +55% Extra Boss Chance. The user's field observation is approximately one Mimic encounter per 20 enemies with occasional double spawns. This is the frequency used for hourly comparisons.

The installed Windows game (Steam build 26703178) classifies the Golden Mimic as a Wave Boss. In `Assembly-CSharp.dll`, the final-kill reward path `by.zw` applies the attacker's Kill Gold, Wave Boss Gold (`ci.bfq`), Mimic reward (`ci.bhy`) and eligible kill skills. The Stats display `hh.updPanel` subtracts the built-in base factors when showing the percentages. Ordinary boss gold starts at ×10 and a Mimic pays ×3 on top of boss gold. +340% therefore gives ×13.2 over an otherwise identical ordinary boss. The displayed +912% can already include global Boss Gold synergies from deployed heroes. The calculator normalizes the unknown account-only percentage to zero until the player supplies an undeployed reading. Team Boss Gold effects are applied once.

The reward branch `by.zp` rolls Super first and Ultra on a successful Super. Let `pS` and `pU` be the two chances clamped to [0,1]. For an ordinary Mimic payout index `B`, the expected drop is `B × [(1 − pS) + pS × S × ((1 − pU) + pU × U)]`. Each tier factor starts with ×3, includes that tier's amount bonuses, and multiplies by `1 + excess points × rate / 100` for the same tier. The default rate is 5. The Super-only payout receives Super spillover. The Ultra payout receives both tier factors. A Crusader attack on the target uses the existing, separately configured Golden Arrows payout.

When measured successful Mimic kills/hour is known, multiply it directly by the expected index per Mimic. Otherwise use `enemies cleared/hour × (1 + fraction of double encounters) / enemies per encounter`. Leave the double frequency at zero for a single-spawn estimate until measured. The +67% and +55% spawn statistics are already reflected in the observed encounters. Team suggestions compare candidate lineups at equal throughput. The standard boss comparison retains its previous guaranteed-Ultra, shared-spillover index.

The captured active skill profiles supply Rogue Gold Aura, Hunter Gold Lust and Sovereign Jackpot. Those screenshot inputs describe an active window. The estimate keeps fractional displayed chances and omits uncaptured Rogue and Sovereign mastery stacks. Hourly results also assume the configured skill window is representative of the Mimic kills counted. Automated bosses may have extra account reward modifiers. Absolute currency depends on the wave and additional account bonuses.

### Energy + Power Mages objective

The user specified a separate payout for Power Mage kills: multiply the complete ordinary Energy index by every Power Mage Energy multiplier. The fifth focus therefore uses `energy × PRODUCT(1 + scaled Power Mage Energy / 100)`. The existing Super/Ultra Energy and Energy chance overflow are included once through `energy`; there is no additional Power Mage chance pool. The assumed base Energy remains 10,000 unless edited. This is a relative index per Power Mage kill, not a kill-rate model or an extra payout added to each wave.

Both recorded Power Mage Energy effects are global: Captain's level-7,500 milestone (conditional base 10) and Arbalest's tier-VII synergy with Militia and Spelldancer (conditional base 12). Each qualifying deployed copy contributes a separate factor. Normal milestone/synergy scaling, event settings, tiles, rank limits and partner requirements apply. No personal attacker bonus is included in the Power Mage factor. Ordinary Energy and the three attacker-based metrics keep their existing formulas. Team and tile searches, comparisons and global-milestone support rankings expose this new focus; its A/B pair is saved separately in version-6 setups.

Captain is required by the user for Energy + Power Mages team suggestions. A deployed Captain satisfies the minimum at any entered level; no skill-unlock threshold was supplied. The [level-10 mastery screenshot](power-mage-review/captain-skill-mastery.png) says each Power Mage ultra boss killed within range rewards +330% more energy, stacking additively to 30 stacks. This is a separate skill effect, not a new milestone or synergy record. Its current stack count and interaction with other skill bonuses are not modeled. Required presence is enforced even outside the optional roster, while existing lineups remain editable and missing-Captain notices identify invalid compositions.

The payout rule is user-provided. It does not resolve Captain's potential stat-specific scaling exemption or the equivalent Arbalest parameterizations (base 12 with the ordinary owner multiplier versus base 15 without it). Existing screenshot provenance and conditional-base flags remain intact.

## Grand Master combat style

The user provided a Grand Master screenshot and requested the style on every deployed hero. Each copy adds one independent +150% global Damage multiplier and +150% global Kill Gold multiplier; adds +5 Skill Power and +5 Mastery Power globally; and imposes a -90% Attack Speed multiplier on its own hero. Skill/Mastery Power are shown in the breakdown and are not treated as basic-attack damage.

The initial user assumption was additive +10% milestone and synergy boosts per hero. Later synergy screenshots and three identified +5% global modifiers support **compounded synergy Grand Masters**: `1.1^N`. At nine Grand Masters, `1.1^9 × 1.05^3 × 1.25 = 3.412023994742347` before tier factors reproduces 41/43 captured values, including all 16 Militia effects; using `1 + 0.1*N` reproduces none of the 43. A subsequent Militia milestone screenshot with nine Grand Masters independently supports **compounded milestone Grand Masters**: `2.8125 × 1.1^9 = 6.631727880937506` reproduces all 17 displayed milestones; additive Grand Masters reproduce none. Both stacking defaults now compound, with separate override controls. The three +5% synergy modifiers do not affect milestones. See the milestone and synergy review directories for the evidence. Style effects themselves are not amplified. Synergy rounding is retained after scaling; milestone decimals are preserved. The original Instant Trainee value `0.05` is an Excel percentage storing 5 percentage points, corrected during milestone review.

## Snow Fort and placement constraints

User-provided map settings override the old workbook's simpler Snow Fort treatment: tier-5 and tier-6 synergy amounts receive +115% (2.15×), tier-7 amounts receive +77% (1.77×), global Mastery Skill Power receives +33%, and global Attack Speed receives -20% (0.8× once). Other synergy tiers retain their ordinary scale.

There are up to three distinct milestone tiles (+20% to the owner's emitted milestone bonuses), three synergy tiles (+10% to the owner's emitted synergy bonuses), three skill tiles (+20% local skill power), one personal Kill Gold tile, and one personal Damage tile; each hero occupies one tile. Remaining slots are normal. Tiles boost bonuses emitted by their owner, so a boosted global milestone or synergy benefits every teammate. The user's additive tile rule is retained: with ten Grand Masters, the milestone pool is `1.1^10 + 0.2 = 2.7937424601` and the synergy pool is `1.1^10 + 0.1 = 2.6937424601`. Permanent milestone strength multiplies its pool once. Manual, account, owner, and tier factors multiply the synergy pool before one final rounding. Militia was off a synergy tile in the synergy captures. The subsequent milestone capture matches the no-milestone-tile formula but its tile was not separately specified; tile interaction remains unverified. Milestone fractions remain unrounded. Raw Skill and Mastery Power remain visible without a reconstructed scaling curve; captured Gold and Damage skills use the calibrated profiles below.

The user limited deployment to three copies of each hero and ten total heroes. Placement suggestions keep hero identity, level, and slot index fixed. Hero locks constrain roster substitutions; tiles remain assignable. Energy and Experience tile optimization searches the 4,200 milestone/synergy assignments for a ten-hero lineup, assigning remaining skill tiles by Skill Power totals then damage as a proxy. Gold additionally enumerates the killer’s Kill Gold tile and every relevant named skill-tile copy, including choosing not to boost a skill, then fills remaining milestone/synergy allocations. It compares the complete active-kill payout, preserves the input as a no-regression candidate, and matches the detailed evaluator.

## Gold killer placement and active skill calibration

The November 4 screenshots and confirmations are archived in `gold-review/placement-skills.json`. Kill Gold placement level 99 displays +2,475%, modeled as a personal ×25.75 Kill Gold factor independent of milestone/GM/event strength. Only the designated killer's personal factor affects the Gold objective. The UI allows one Kill Gold tile, an explicit calculator inventory assumption for the one-attacker use case, alongside one Damage tile and up to three each of milestone, synergy and skill tiles.

The user confirms the captured no-tile skill values and exact ×1.20 multiplication of each bonus on a skill-power tile:

| Skill | Without tile | With skill tile |
| --- | ---: | ---: |
| Rogue Gold Aura, Kill Gold | +8,070% | +9,684% |
| Hunter Gold Lust, Kill Gold | +28,720% | +34,464% |
| Sovereign Jackpot, Super Gold chance | +325.8 pp | +390.96 pp |
| Sovereign Jackpot, Super Gold amount | +1,629% | +1,954.8% |

All three skills are assumed active on the kill and in range, each named skill once even with duplicates (explicit user confirmation). A deployed skill-tiled copy is used when available. Rogue/Hunter add independent multiplicative Kill Gold factors; Sovereign adds a Super Gold amount factor and its chance to the existing overflow pool once. Absent heroes and disabled skills contribute nothing. Map-off disables placement boosts while retaining the configured base skill values. Other resource and damage objectives are unchanged; the Gold side card uses these rules in every focus.

These are captured **total** skill bonuses, not inferred unscaled skill bases. Their account/lineup contribution is unspecified, so raw Skill Power from milestones/synergies/GM and the event is not reapplied. Inputs remain editable and fixed when candidate lineups change. The model evaluates the confirmed +20% placement effect; it does not claim that a different roster leaves in-game no-tile skill values unchanged. Rogue/Sovereign cooldown 28s and duration 25s, and Hunter cooldown 20s, are archived but not used for uptime averaging under the user's active-kill objective.

The UI's direct killer-tile comparison uses the fixed roster and selected attacker, finding the best legal exchange only when a requested tile type is already full. The full placement optimizer separately searches all assignments together. Skills are excluded from the standalone global milestone ranking. Version-7 saves retain the profile and new placement; older saves receive the captured defaults without changing existing lineups.

### Crusader generated gold

The later Golden Arrows screenshot and explicit **one attack on a wave boss** reply are archived in `gold-review/crusader-golden-arrows.json`. The skill generates 6,420% Kill Gold per attack, excludes all Boss Gold bonuses, lasts 20 seconds with a 24-second cooldown, and operates at 50% efficiency on wave bosses. Mastery adds +20.6% gold per consecutive attack on the same enemy, stacking additively to 500 stacks. The model interprets the first hit as having zero prior-hit stacks.

Let `K` be passive global × selected-attacker personal Kill Gold, including milestone/synergy/GM factors and the attacker’s Kill Gold tile, but excluding Rogue and Hunter's separate on-kill factors. Let `N` be the configured integer attack count, `A` the active percent and `M` the mastery percent after any local skill-tile boost. Generated gold is:

`G = K × (A / 100) × 0.5 × SUM(1 + (M / 100) × MIN(j, 500), j = 0 .. N-1)`

The configured first-hit case is `G = K × 64.2 × 0.5 = K × 32.1`, or `K × 38.52` on a skill tile. The 50% penalty applies once. The Gold score becomes `existing final boss-kill index + G`; Boss Gold and Gold chance spillover are never multiplied into `G`. Super/Ultra rewards and the three conditional on-kill support skills remain unconfirmed for this instant payout and are conservatively excluded from it. They still apply normally to the final kill. Addition uses the existing normalized shared base-gold scale; absolute base monster versus boss currency and attack rate are not simulated.

Only the selected attacking Crusader contributes generated gold. Other Crusader copies do not stack it or supply their tile bonus. As with earlier skill profiles, captured totals are editable and fixed across teams. The new screenshot's tile state was not separately confirmed; it continues the no-tile baseline convention and previously confirmed ×1.20 active/mastery tile rule. Count, active and mastery fields save with the existing settings schema; missing fields receive defaults without altering focus teams. The Gold skills toggle disables this component too.

Detailed evaluation, compiled team scoring and compiled Gold placement scoring use the same separate-payout rule. Automatic attacker selection can choose Crusader using the combined score. Direct attacker comparisons add a skill-tile option for Crusader. Full Gold placement search considers that option alongside Hunter/Rogue/Sovereign skill tiles while respecting the shared maximum of three; it preserves the input as a no-regression candidate. `tests/crusader-gold.test.cjs` checks hand arithmetic, capped per-hit sums, excluded bonuses, local ownership and independent exhaustive placement examples.

## Damage attacker placement and skill calibration

The November 4 Damage screenshots and confirmations are archived in `damage-review/placement-skills.json`. The user confirmed no skill tiles in the captures, a +2,475% Damage tile, optimization while the skill is active, and ×1.20 for both active and mastery bonuses on a skill tile. A Damage tile contributes a personal ×25.75 factor, independently of milestone, GM and event strength. There is one Damage tile in addition to the one Kill Gold tile and up to three each of milestone, synergy and skill tiles.

| Attacker | Active bonuses | Mastery bonuses |
| --- | --- | --- |
| Praetorian | +1,436 pp Super Crit Chance; +7,180% Super Crit Damage | +124 pp Ultra Crit Chance; +6,179% Ultra Crit Damage |
| Deadeye | +24,210% Damage; +16,115% Attack Speed; +484.2 pp Ultra Crit Chance | +2,060% Super Crit Damage |
| Dicemaster | Crit 5–2,867 pp; Super Crit 3–1,436 pp; Ultra Crit 1–718 pp | 41.2% chance of maximum roll |
| Warden | +16,140% Attack Speed; +8,070% Damage | Observed +180,249% Damage at 10.7 m |
| Warlord | +14,360% Damage; +7,180% Attack Speed | +206 pp Super Crit Chance; +4,119% Super Crit Damage |

Only the selected attacker's personal skill effects enter its Damage metric. Independent amount factors multiply; skill chances enter the existing additive critical spillover pool. No raw Skill Power, map mastery, GM or event boost is reapplied to the captured totals. The editable baselines remain fixed as the lineup changes; other heroes retain their passive scores until their skills are captured. Cooldowns and duration are recorded but not averaged. This remains a single-target bonus index, excluding base damage, base attack speed and its cap, splash, range and additional targets.

The user's latest Warden capture supplies a direct calibration: **+180,249% at 10.7 m**. Mastery Damage is `reference bonus × distance / reference distance`, then ×1.20 on a skill tile. The default gives +216,298.8% with that tile. Zero distance yields zero mastery bonus. Proportional scaling is a model assumption; the rounded +1,236% per 0.07 m labels do not reproduce the observed total exactly and are retained only as evidence. Both the reference pair and target distance are editable and saved.

Dicemaster uses `p × maximum + (1 − p) × (minimum + maximum) / 2` for each chance tier, where `p` is the mastery probability. Non-maximum rolls are assumed uniform. This gives the exact expected Damage index for the existing linear overflow model. Skill tiles scale both endpoints and the mastery probability, with `p` capped at one. No independent multiplication of mean chance tiers is introduced.

Damage placement search enumerates relevant normal, milestone, synergy, skill and Damage assignments, respecting tile limits and the designated attacker. Automatic attacker searches compare each candidate's personal skills with its support globals. The input lineup remains a no-regression candidate. Direct comparison holds other placements fixed except for the best legal exchange when a tile type is full. Version-8 saves persist profiles, distance, toggle and placements; older setups receive these defaults while retaining their teams. Standalone milestone support rankings exclude all captured skills.

## Source problems to avoid copying

- `Simulator!F19` reads `Data!DT2:DT43` (milestone effect text), instead of the base attack-speed column `DW`.
- `Simulator!J19` references `Data!AC40` rather than `AC140`.
- `Simulator!O17`, labeled Ultra Boss Damage, reads the Boss Exp aggregate `Data!AE94` instead of `AB96`.
- `Data!AI84` and `AI86` multiply energy chance effects instead of summing; `AD86` alone divides its chance sum by 100.
- `Data!AJ85` includes two spaces in `Ultra Energy  Amount`, preventing matches to the raw spelling.
- Aggregation ranges end at varying rows 122, 130, 153, 200, and 223, so some populated effects may be truncated.
- Many Google Sheets QUERY/FILTER formulas export as `__xludf.DUMMYFUNCTION` wrappers with cached values; cached values are evidence of the current supplied lineup, not a reusable calculation engine.
- Source damage combines crit multipliers assuming successful crits, and has an attack-speed cap/overflow expression in `Simulator!F17`. A simple damage index should not be presented as exact DPS or promise source simulator totals.

Normalize unambiguous spelling errors: `Ultra Crit Chnce` → `Ultra Crit Chance`; `Ultra Crit Dmage` and `Ultra Ctir Damage` → `Ultra Crit Damage`; `Ultra Energe Chance` → `Ultra Energy Chance`; `Bp Exp` → `Battle Pass Exp`.

The user initially selected `Super Energy Chance` for the seven bare `Super Energy` labels (Apprentice s8, Elementalist s7, Arbalest s10, Paladin s8, Skymage s10, Chieftain s7, Crusader s8). Screenshots through batch25 explicitly identify all seven as **Super Energy Amount**, now corrected. Paladin s8 was the final unresolved label, shown as +38% global Super Energy Amount in the Chieftain capture. The source queries ignore these bare labels entirely. Sovereign's level-3000 milestone (`Data!DD39:DF39`) was also resolved by screenshot as **Ultra Exp Amount**, now active.

## Independent regression examples

These are examples from the original workbook snapshot, before screenshot milestone corrections and account boosts. All use synergy scale 1, no maps/stances/events/account profile and normalized attack speed (no hero base-speed weighting). Source activation tests use the requirement reduction disabled unless stated otherwise.

1. Militia + Apprentice at level 0 and synergy tier 1: Militia gives global +10% Damage (`Data!C2:F2`), Apprentice gives global +3% Attack Speed (`C3:F3`). Each hero's normalized damage is 1.1 × 1.03 = 1.133.
2. Same team at level 25: Militia's personal +10% Damage (`BZ2:CB2`) changes its score to 1.2463; Apprentice's personal +5% Attack Speed (`BZ3:CB3`) changes its score to 1.18965. Their mean is 1.217975; their sum is 2.43595. The owner's personal bonus must not affect the other hero.
3. Two Scouts at level 25, without qualifying synergies: each contributes global +3% Kill Gold (`BZ4:CB4`), giving 1.03² = 1.0609 per hero, not 1.06.
4. Two Militias at level 500, without qualifying synergies: each contributes global +5 Rank Exp (`CL2:CN2`), giving an XP factor of 1.10, not 1.1025.
5. Sovereign plus two Crusaders must not activate Sovereign record 15; adding a third Crusader should activate it. The same count rule applies to each Crusader record 15.
6. A synthetic +10pp global Crit Chance plus +10pp global Super Crit Chance should yield one 2.0× spillover modifier at +5% per pp, rather than 1.5 × 1.5 = 2.25×.
7. With the user's requirement reduction enabled, Sovereign plus two Crusaders now activates Sovereign record 15; Sovereign plus one Crusader does not. Crusader record 15 can be satisfied by two other Crusaders without Sovereign, or by Sovereign plus one other Crusader, because any two of its three partners suffice.


## Ninja synergy capture update

The second capture covers 43 effects in 16 groups, with all four tier IX effects matching the earlier Militia capture. The same nine-Grand-Master profile reproduces all 16 Ninja-owned effects and 37 of the 43 frozen spreadsheet magnitudes. Three scope corrections, two type corrections and one cooldown sign correction are directly visible. Six paired integer bases are inferred under the continuing account/map context: Sorcerer T1 4, Witch T1 20, Berserker T2 6, Rogue T3 35, Peacekeeper T4 7, Warlock T6 275. They are explicitly tagged inferred-calibrated and validated against the display rounding interval; all 43 Ninja observations reproduce after correction. See `synergy-review/ninja-analysis.md` for every row and the source cells. Warden T8's +33 Skill Power also matches its lower owner modifier. The two earlier unresolved Militia-batch numeric exceptions are unchanged; these captures still do not establish tile interaction.

## Spelldancer and Gladiator synergy evidence

Batches 03 and 04 contribute 86 observations. All 15 effects overlapping earlier batches agree; all four batches total 172 observations / 153 unique effects in 58 unique groups. The continuing nine-Grand-Master profile is inferred from unchanged effects and overlap, not newly confirmed. Fifteen new correction records apply four stat types, seven scopes, two cooldown signs and eleven conditional integer bases. See `synergy-review/spelldancer-gladiator-analysis.md`. Corrected active data matches 85/86 new observations; the sole exception repeats the unresolved unscored Arbalest tier VII Power Mage Energy. Across all captures 151/153 unique effects match, with the earlier Peacekeeper tier II Skill Power exception also unresolved. No scoring formula changed.


## Veteran, Praetorian, and Battlemage synergy evidence

Batches 05-07 add 129 observations, all reproduced after 19 corrected records: five types, two scopes, nine cooldown signs, and nine conditional integer bases. The continuation of the nine-Grand-Master account/map context remains an inference; owner tiles were not specified. All 25 appearances overlapping previous captures and eight internal repeated effects agree. Across seven batches, 301 observations cover 249 unique effects in 94 groups, with 52 repeats and no conflicts. Active data reproduces 298/301 observations (247/249 unique effects); the two older unscored exceptions remain unchanged. See `synergy-review/veteran-praetorian-battlemage-analysis.md`. Paladin tier IX Shadow Runes retain their original base and personal scope, with an explicit flat unit. No scoring formula changed; regressions verify the changed XP outcome, global effects reaching other heroes, cooldown direction, and unscored Shadow Runes.


## Audit through batch 22

Later updates in the README supersede the historical per-batch unresolved totals above. Twenty full selected-hero pages plus two partial pages now supply 889 observations / 575 unique owner effects in 223 groups; 97 source effects remain uncaptured. All archived observations reproduce under their recorded contexts and the current conditional bases. Batches17–22 continue the preceding user-confirmed nine-GM event context by inference, supported by overlapping values. They contribute 201 observations and 19 corrected records (four types, three scopes, four signs and fourteen inferred bases). Peacekeeper’s tierIII group now grants global XP chance and amount; Warlord tierII grants Attack Speed; Sorcerer tierII Damage and Witch tierII Attack Speed are global. Elementalist tierIV resolves to Super Energy Amount.

Peacekeeper tierII conditional base5 reproduces +107 without the event and +117 with it. Arbalest tierVII equivalent base12 with the ordinary owner multiplier reproduces +72%/+80%; base15 without owner amplification produces the same displays. These captures resolve model display mismatches but do not distinguish Arbalest’s underlying mechanism. The named skill remains unscored. Per-record inference notes retain this limitation in the deployed data. Partial Peacekeeper I–III and Arbalest VI–VIII screenshots are not treated as complete pages. The engine capture regression checks every archived appearance, including repeats, and the source rebuild regression verifies these corrections survive fresh extraction.


## Audit through batch 26

Forester, Templar, Chieftain and Deadeye add 172 observations, all reproduced after 15 distinct corrections: three types, one scope, eight signs and seven conditional bases. Warlock tierVI is personal negative Skill Cooldown rather than global Ultra Energy Chance; Deadeye tierIV grants global Damage rather than Energy Income; Paladin tierIV is Super Energy Amount. All seven formerly ambiguous bare Super Energy labels are now resolved. Flat Skill Power and Skill Duration corrections remain unscored; the signed cooldowns remain visible without an invented skill-uptime formula.

The complete corpus now contains 1,061 matching observed appearances, 628 unique owner effects and 246 groups, with no normalized overlap conflicts. Twenty-four selected pages are complete and two are partial. Forty-four effects in 21 groups remain unseen. The latest four captures continue the prior nine-GM event profile by inference; the common profile and off-synergy-tile assumption remain explicit. Existing Arbalest Power Mage Energy ambiguity is unchanged. The coverage report now lists exact remaining groups and useful three-tier capture windows, as well as full-page priorities. Production regression checks all captured values and the changed scoring behavior; source rebuild tests preserve inferred bases and their provenance.


## Audit through batch 30

Four partial sections add 60 observations. All reproduce after correcting Crusader tierI global cooldown to base−2 (−47% displayed) and Skymage tierI personal cooldown to base−10 (−235%). The other 58 observations already matched, including every Gold-related field. Cooldowns remain visible and unscored, so these changes do not alter focus scores. No base magnitudes or formulas changed.

Across 30 batches there are 1,121 matching observed appearances, 650 unique owner effects and 256 groups; 22 effects in eleven pair groups remain unseen. Twenty-four selected pages are complete and six are partial. Batches27–30 continue the preceding nine-GM active-event profile by inference, checked against overlaps. The final grouped capture checklist in the README covers every remaining pair exactly once across six heroes and eleven targeted tier sections. Previous capture-specific modifiers, inferred bases and the Arbalest Power Mage Energy interpretation caveat remain unchanged.

## Current audit through batch 36

Wizard, Berserker, Necromancer, Peacekeeper, Skymage and Witch partial captures add 134 observations. Every displayed value, type, scope, sign and unit already matches the current model, so no further correction or formula change is applied. These captures complete the last 22 owner effects across eleven pair groups. Their nine-GM active-event profile continues the preceding confirmed settings by inference and agrees with the overlapping evidence.

All 1,255 appearances across 36 batches reproduce under their recorded contexts. The audit covers all 672 directional effects in all 267 source groups across 42 heroes, with no normalized overlap conflicts or unseen effects. Twenty-four selected pages are complete and eleven are partial; partner appearances cover the other seven heroes. The exact owner/tier/partner-set regression establishes source coverage without assuming that every selected page is complete. Capture recommendations are now empty.

Matching screenshots establishes consistency for the recorded profiles. It does not independently establish unboosted bases, tile interactions or every modifier combination. The 64 conditional bases and Arbalest Power Mage Energy's equivalent parameterizations remain explicitly documented; that effect now contributes to the separate Energy + Power Mages objective under the user-specified payout rule, without resolving its base interpretation.


## Global Damage support skills — November 4

The user supplied eleven images covering ten unique support heroes (the two Templar images repeat the same skill). The archived screenshots and transcribed values are in `damage-review/support-skills.json` and `damage-review/images/support-*.png`. The current scenario is 20 seconds of accumulated mastery, 100 additive kill stacks, three Skymage teleports, and all buffs active/in range. The user explicitly selected Necromancer midpoint values and capped Wizard triple-shot chance at 100% (×3 attacks).

Every support skill uses its first deployed hero copy and that copy’s tile. Other copies retain their ordinary milestones/synergies but cannot add or replace this skill. Each global skill contributes once to the selected attacker. Detailed evaluation, cached team scoring, the attacker tile comparison and joint placement search share this rule. Damage suggestions consider up to three skill tiles on first support owners and the personal attacker, alongside milestone, synergy and one Damage tile. Personal and support skills can be toggled separately.

Druid and Witch explicitly provide a second independent multiplier; Spelldancer describes an additional multiplier. Additive time/kill stacks are accumulated before forming each factor. Druid at 20 seconds is `(1 + 7180/100) × (1 + 82.4×20/100) = 72.8 × 17.48`. Apprentice is ×9.24; Skymage after three teleports is ×38.08. Templar is modeled as separate active and accumulated mastery splash factors, `15.36 × 9.24`; this is an interpretation of “more splash damage,” not independently verified in-game stacking. Per the user’s new scoring instruction, splash also includes Warlord’s +1,436% active bonus and multiplies single-target output without an enemy count. This supersedes its prior exclusion in the personal skill review.

Wizard’s 206% triple-shot chance contributes exactly ×3 attacks and no chance spillover; even a skill tile cannot exceed that cap. Necromancer uses each displayed range’s midpoint (4,047.5 Damage/Attack Speed; 517.5 Crit Damage; 310.5 Super Crit Damage; 103.5 Ultra Crit Damage). This is a midpoint scenario, not an exact expected product: roll correlation/distribution has not been established. The maximum-roll option is a separate scenario. Other crit chance additions use the existing shared Damage spillover model.

The established no-skill-tile baseline convention is retained for this screenshot batch; +20% tiles scale active and mastery bonuses once. Generic Skill Power, GM, the event and map mastery are already implicit in the captured values and are not reapplied. Movement slow magnitude, teleport target count, range, multi-target counts and cooldown averaging remain outside the single-target index. Base damage, base attack speed and attack-speed caps remain unmodeled. Version-9 saves add support settings while preserving prior teams and personal profiles, including Warden’s observed +180,249% at 10.7m.

## Experience tile and Veteran sharing — November 19, 2026

The user's in-game test confirmed that the Snow Fort XP tile multiplies its occupant's kill payout before Veteran shares it. This revises the November 11 model, which applied the bonus only to direct XP for the selected leveling hero. The reported rule is recorded in `experience-review/xp-tile.json`.

For an individual kill, multiply the killer's ordinary XP payout by 1.20 if it occupies the active XP tile. The killer takes the resulting award directly. Every eligible teammate gets the same award when Exp Share triggers, so expected XP for the selected recipient is the resulting award times the effective share chance. A recipient standing on the XP tile gains its bonus only when that recipient makes a kill. The source reward receives the multiplier once, independent of the number of recipients. The tile affects the payout after Rank EXP, Super/Ultra chances and the other reward factors have been evaluated.

Experience teams have one XP tile. Any slot may hold it. The attacker tile table compares legal exchanges on the current killer. Tile suggestions and the leveling plan also compare the killer's tile against milestone, synergy and Archer, Ballista or Veteran skill placements. Saved placements remain attached to their slots when the leveling target changes. Disabling Snow Fort disables the multiplier.

## Archer's mark and XP skill tiles — November 19, 2026

The installed Steam build 26703178 applies the owner's skill tile to effective Skill Power before rounding (`cl.blc` and `ci.bbu`). Archer's tooltip gives +200% plus 20 percentage points per Skill Power. Its cast stores a full reward factor of `(3 + 0.2 × Skill Power) × (1 + mastery per wave × wave)` for an ordinary enemy (`cl.blz`). The mastery term derives from account Mastery Power (`ci.bbz`) and purchased mastery level. The kill calculation multiplies by that stored factor once (`by.zy`). Unmarked kills receive ×1 from the mark. Veteran passes the resulting killer XP to eligible recipients.

At +13,240% without a tile and +0.65% per wave, the captures imply 652 Skill Power and a wave factor of 488.5 at wave 75,000. Applying the 20% tile to the inferred 652 gives 782 after rounding. Full tag coverage then produces ×77,866.90 from a skill-tiled Archer or ×78,199.08 from the same Archer's own kills on the XP tile. The hidden pre-round Skill Power and changes in Skill Power as lineups change are not available in the tooltip. A different active Skill Power or tag coverage can change the comparison.

The same cast and kill paths use a separate active aura and stacked mastery factor for Ballista. Veteran's active share and Super EXP chances use rounded Skill Power contributions. These two heroes' mastery stacks use account Mastery Power. This verification applies to the XP skills used in the leveling calculation.

## Tycoon and Magnate on XP supports — November 11, 2026

The user explicitly requested comparing these styles on both the leveler and maxed supports. The new screenshot confirms Tycoon at rank 1,250 with global +5% Rank EXP, +5% Synergy Bonus and +5 flat Energy Income. Magnate unlocks at rank 4,000 and supplies global +12% Rank EXP, +8% Synergy Bonus and +5% Energy Income. Full transcriptions are in `experience-review/combat-styles.json`.

Each hero's support copies share one style. Only Grand Master copies remain in the GM milestone pool; synergy strength uses the GM/Tycoon/Magnate counts under the selected stacking rule. Rank percentage factors apply once per copy. Magnate's Energy Income uses a distinct percentage multiplier, preserving Tycoon's flat addition. Global Rank EXP and synergy factors affect either direct or Veteran-shared XP, and the XP tile scales rewards from the killer standing on it before any share. Captured active skill profiles remain fixed and Instant Spell remains unscored.

Version 18 stores explicit support styles and per-team support-style search preferences. A fixed-roster, fixed-tile search enumerates reachable style-count states grouped by hero ID. Team search alternates style, placement and roster improvements with uniform-style seeds; it remains heuristic. Style changes also split leveling-plan recommendations. Stored references retain their actual style context, and an explicit all-GM capture overrides current mixed choices without editing the team.
