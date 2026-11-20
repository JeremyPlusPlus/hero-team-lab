# Batch 04 milestone review

Recorded November 2, 2026. Eight screenshots add **136 observed milestones**, bringing coverage to **34 of 60 heroes and 578 milestones**. Ballista, Chieftain, Warlock, Crusader, Champion, Templar, Captain, and Warlord each have all 17 levels through 10,000 captured. An independent reading verified every effect's type, signed value, unit, and scope, plus each hero's displayed base stats.

## Confirmed type and scope differences

| Hero | Level | Original sheet | Screenshot |
| --- | ---: | --- | --- |
| Warlock | 4,000 | Ultra Exp Amount, global | +3% Ultra Energy Chance, global |
| Captain | 6,000 | Skill Power, personal | +8% Ultra Energy Chance, global |
| Warlord | 4,000 | Super Exp Chance, global | +8% Ultra Exp Chance, global |

Captain changes both type and scope. The review now tracks changed fields independently so a type change cannot conceal a simultaneous scope change. No other type or scope changes occur in this batch's 128 overlapping milestones.

## Percentage exception

Captain level 7,500 is explicitly **+28% Power Mage Energy, global**. The original sheet gives base 15 for that same label and scope. The provisional ×2.8125 scale would produce 42 after rounding, not 28.

This batch contains 94 comparable percentage entries; 93 fit the previous provisional scale and this one does not. Across all batches, **413 of 414** fit `[2.8125, 2.814)` under unchanged bases and nearest-integer rounding. The interval over all 414 rows is empty, so the review reports the matching set and exception separately.

The exception could reflect a changed base or different account behavior. Both base 10 at ×2.8125 and base 15 at ×1.875 round to 28; neither explanation is confirmed by the screenshot. The exact displayed value is preserved without selecting either explanation. Power Mage Energy is not silently renamed to another energy effect.

## Flat values needing review

Eleven flat entries fail to reproduce their displayed amounts under the provisional scale:

| Hero | Level | Stat | Old base | Displayed |
| --- | ---: | --- | ---: | ---: |
| Ballista | 2,500 | Skill Power | 5 | 23 |
| Chieftain | 150 | Skill Power | 1 | 6 |
| Chieftain | 500 | Rank Exp | 5 | 23 |
| Warlock | 2,000 | Skill Power | 4 | 17 |
| Champion | 1,500 | Skill Power | 3 | 14 |
| Templar | 250 | Skill Power | 1 | 6 |
| Templar | 500 | Rank Exp | 5 | 23 |
| Captain | 500 | Skill Power | 2 | 8 |
| Captain | 1,000 | Rank Exp | 8 | 42 |
| Warlord | 1,000 | Rank Exp | 8 | 42 |
| Warlord | 1,500 | Skill Power | 3 | 14 |

Crusader's existing milestones match the old types, scopes, and provisionally scaled values. The value differences above remain observations, not confirmed changes to raw bases.

## Level-10,000 observations

| Hero | Displayed bonus | Scope |
| --- | --- | --- |
| Ballista | +113% Ultra Exp Amount | Global |
| Chieftain | +84% Ultra Energy Amount | Global |
| Warlock | +14% Instant Accelerate | Global |
| Crusader | +28 Skill Duration (flat) | Personal |
| Champion | -70% Skill Cooldown | Personal |
| Templar | +14% Instant Agility | Global |
| Captain | +14% Instant Time Warp | Global |
| Warlord | +984% Ultra Crit Damage | Personal |

The original screenshots are archived with hashes. Active calculator milestones and scoring remain unchanged; the standalone review is a separate evidence layer.
