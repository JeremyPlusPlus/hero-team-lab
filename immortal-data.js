(function (root) {
  'use strict';
  // Idle Hero TD for Windows, Steam build 26180061. Each hero's serialized
  // prefab in IdleHeroTD_Data/data.unity3d records heroClass, baseCritChance,
  // skillTitle and baseSkillCooldownTime. Base hit damage and attacks per second
  // are already captured in HERO_DATA.heroes[].observedBaseStats.
  const classes = {
    melee: ['militia', 'viking', 'ninja', 'assassin', 'peacekeeper', 'samurai', 'paladin', 'gladiator', 'berserker', 'chieftain', 'champion', 'warlord', 'praetorian', 'titan'],
    mage: ['apprentice', 'druid', 'sorcerer', 'witch', 'wizard', 'elementalist', 'battlemage', 'spelldancer', 'skymage', 'warlock', 'templar', 'necromancer', 'sovereign', 'dicemaster'],
    ranged: ['scout', 'hunter', 'forester', 'archer', 'ranger', 'arbalest', 'sniper', 'rogue', 'ballista', 'crusader', 'captain', 'warden', 'deadeye', 'veteran']
  };
  root.IMMORTAL_HERO_TYPES = Object.fromEntries(Object.entries(classes).flatMap(
    ([type, ids]) => ids.map(id => [id, type])
  ));
  root.IMMORTAL_BASE_CRIT_CHANCE = {
    militia: 1, viking: 3, ninja: 8, assassin: 5, peacekeeper: 5, samurai: 5, paladin: 3, gladiator: 1, berserker: 5, chieftain: 5, champion: 3, warlord: 3, praetorian: 5, titan: 5,
    apprentice: 1, druid: 1, sorcerer: 1, witch: 5, wizard: 1, elementalist: 1, battlemage: 5, spelldancer: 1, skymage: 1, warlock: 3, templar: 1, necromancer: 1, sovereign: 1, dicemaster: 5,
    scout: 3, hunter: 3, forester: 3, archer: 1, ranger: 5, arbalest: 1, sniper: 3, rogue: 3, ballista: 3, crusader: 1, captain: 1, warden: 5, deadeye: 5, veteran: 3
  };
  // One crit-eligible packet on the single boss per cast. Militia and
  // Chieftain replace the whole attack action. Scout and Sniper transform
  // the first projectile, leaving the Wizard's additional shots as basics.
  // The positive mastery factor on Pierce Shot multiplies the original hit
  // when the hero has a mastery level. Nearby secondary targets are separate.
  root.IMMORTAL_CAST_SKILLS = {
    militia:   {name: 'Spin Attack',    base: 3,   perPower: 0.30, replacesVolley: true},
    chieftain: {name: 'Ground Slam',    base: 2.5, perPower: 0.25, replacesVolley: true},
    scout:     {name: 'Pierce Shot',    base: 7.5, perPower: 0.75, replacesVolley: false, masteryFactor: 2.5},
    sniper:    {name: 'Explosive Shot', base: 5,   perPower: 0.50, replacesVolley: false}
  };
  root.IMMORTAL_BASE_COOLDOWN = {
    militia: 24, viking: 24, ninja: 20, assassin: 32, peacekeeper: 24, samurai: 24, paladin: 28, gladiator: 24, berserker: 28, chieftain: 28, champion: 24, warlord: 24, praetorian: 28, titan: 32,
    apprentice: 24, druid: 28, sorcerer: 32, witch: 28, wizard: 28, elementalist: 32, battlemage: 28, spelldancer: 28, skymage: 32, warlock: 28, templar: 28, necromancer: 32, sovereign: 28, dicemaster: 32,
    scout: 20, hunter: 20, forester: 20, archer: 20, ranger: 24, arbalest: 28, sniper: 24, rogue: 28, ballista: 28, crusader: 24, captain: 32, warden: 24, deadeye: 28, veteran: 32
  };
})(typeof window !== 'undefined' ? window : globalThis);
