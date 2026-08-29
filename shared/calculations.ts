import {
  BUFFS, COLLECTIONS, CONTAINERS, DRAW_BASE_COST, DRAW_FACTOR, HIGH_TIER_RED_IDS, WEAPONS, WEAPON_UPGRADES,
} from "./balance";
import type {
  BuffId, BuffStack, CollectionConfig, ContainerConfig, EnemyConfig, Rarity, WeaponConfig, WeaponInstance, WeaponKind, WeaponUpgradeKey,
} from "./types";

export const floor2 = (value: number): number => Math.max(0, Math.floor(value * 100) / 100);

export function getEnemyComposition(level: number): Array<{ kind: string; count: number }> {
  const n = level;
  const boss = n % 5 === 0 ? 1 : 0;
  return [
    { kind: "soldier", count: 6 + 2 * n },
    { kind: "shield", count: n < 2 ? 0 : Math.floor(n / 2) },
    { kind: "rocket", count: n < 6 ? 0 : Math.floor(n / 2) },
    { kind: "gunner", count: n < 11 ? 0 : Math.floor(n / 2) },
    { kind: "flamer", count: n < 21 ? 0 : Math.floor(n / 2) },
    { kind: "boss", count: boss },
  ];
}

export function getEnemyMultipliers(level: number): { hp: number; damage: number; fireRate: number; moveSpeed: number } {
  const hp = floor2(Math.pow(1.02, Math.max(0, level - 1)));
  const damage = floor2(1 + 0.03 * Math.max(0, level - 1));
  const fireRate = floor2(Math.min(3, 1 + 0.01 * Math.max(0, level - 1)));
  const moveSpeed = floor2(Math.min(2, 1 + 0.01 * Math.max(0, level - 1)));
  return { hp, damage, fireRate, moveSpeed };
}

export function getWeaponConfig(kind: WeaponKind): WeaponConfig {
  const config = WEAPONS[kind];
  if (!config) throw new Error(`Unknown weapon: ${kind}`);
  return config;
}

export function getWeaponStats(instance: WeaponInstance, buffs: BuffStack[] = []): {
  range: number; fireRate: number; damage: number; pellets: number; pierce: number; weight: number;
} {
  const config = getWeaponConfig(instance.kind);
  const dmgBonus = getBuffStack(buffs, "damage15");
  const rateBonus = getBuffStack(buffs, "fireRate8");
  const extraPellets = getBuffStack(buffs, "pellet1");
  const extraPierce = getBuffStack(buffs, "pierce1");
  return {
    range: config.baseRange * (1 + 0.05 * (instance.levels.range - 1)),
    fireRate: config.baseFireRate * (1 + 0.05 * (instance.levels.fireRate - 1) + 0.08 * rateBonus),
    damage: config.baseDamage * (1 + 0.10 * (instance.levels.damage - 1)) * (1 + 0.15 * dmgBonus),
    pellets: config.basePellets + extraPellets,
    pierce: config.pierce + extraPierce,
    weight: config.weight,
  };
}

export function getUpgradeCost(config: WeaponConfig, levels: Record<WeaponUpgradeKey, number>, key: WeaponUpgradeKey): number {
  return Math.floor(config.price * 0.1 * levels[key]);
}

export function getWeaponSellPrice(config: WeaponConfig): number {
  return Math.floor(config.price * 0.5);
}

export function getEquippedWeight(instances: WeaponInstance[]): number {
  return instances.filter((w) => w.equipped).reduce((sum, w) => sum + getWeaponConfig(w.kind).weight, 0);
}

export function canEquipAll(instances: WeaponInstance[], loadCapacity: number): boolean {
  return getEquippedWeight(instances) <= loadCapacity;
}

export function getDrawCost(drawCount: number): number {
  return DRAW_BASE_COST * Math.pow(DRAW_FACTOR, drawCount);
}

export function getBuffStack(buffs: BuffStack[], id: BuffId): number {
  return buffs.find((b) => b.id === id)?.stacks ?? 0;
}

export function getBuffBonus(buffs: BuffStack[]): {
  hp: number; armor: number; speedMultiplier: number; backpack: number; load: number; damageMultiplier: number; fireRateBonus: number;
  pickupMagnet: boolean; extraPellets: number; extraPierce: number; containerExtra: number; redChance: number; lifesteal: number; stunChance: number; burnStacks: number; freezeStacks: number;
} {
  return {
    hp: 20 * getBuffStack(buffs, "hp20"),
    armor: 25 * getBuffStack(buffs, "armor25"),
    speedMultiplier: 1 + 0.10 * getBuffStack(buffs, "speed10"),
    backpack: 10 * getBuffStack(buffs, "bag10") + 5 * getBuffStack(buffs, "bag5"),
    load: 6 * getBuffStack(buffs, "load6"),
    damageMultiplier: 1 + 0.15 * getBuffStack(buffs, "damage15"),
    fireRateBonus: 0.08 * getBuffStack(buffs, "fireRate8"),
    pickupMagnet: getBuffStack(buffs, "magnet") > 0,
    extraPellets: getBuffStack(buffs, "pellet1"),
    extraPierce: getBuffStack(buffs, "pierce1"),
    containerExtra: getBuffStack(buffs, "containerExtra"),
    redChance: getBuffStack(buffs, "redChance"),
    lifesteal: 0.02 * getBuffStack(buffs, "lifesteal2"),
    stunChance: 0.05 * getBuffStack(buffs, "stun"),
    burnStacks: getBuffStack(buffs, "burn"),
    freezeStacks: getBuffStack(buffs, "freeze"),
  };
}

export function pickRarity(seed: number, weights: Record<Rarity, number>): Rarity {
  const total = weights.blue + weights.purple + weights.gold + weights.red;
  const value = seed * total;
  let acc = 0;
  const order: Rarity[] = ["blue", "purple", "gold", "red"];
  for (const rarity of order) {
    acc += weights[rarity];
    if (value < acc) return rarity;
  }
  return "red";
}

export function pickRedCollection(seed: number, container?: ContainerConfig): CollectionConfig {
  const reds = COLLECTIONS.filter((c) => c.rarity === "red");
  const weights = reds.map((c) => {
    const base = c.redWeight;
    if (container && HIGH_TIER_RED_IDS.has(c.id)) return base * container.highTierMultiplier;
    return base;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const value = seed * total;
  let acc = 0;
  for (let i = 0; i < reds.length; i++) {
    acc += weights[i];
    if (value < acc) return reds[i];
  }
  return reds[reds.length - 1];
}

export function rollCollection(seed: number, source: "enemy" | "small" | "large", redChanceBonus = 0): CollectionConfig {
  const base = CONTAINERS[source === "enemy" ? "small" : source].qualityWeights;
  const redWeight = Math.min(100, base.red + redChanceBonus);
  const remaining = 100 - redWeight;
  const nonRedTotal = base.blue + base.purple + base.gold;
  const weights: Record<Rarity, number> = {
    blue: nonRedTotal ? (base.blue / nonRedTotal) * remaining : 0,
    purple: nonRedTotal ? (base.purple / nonRedTotal) * remaining : 0,
    gold: nonRedTotal ? (base.gold / nonRedTotal) * remaining : 0,
    red: redWeight,
  };
  const rarity = pickRarity(seed, weights);
  if (rarity !== "red") {
    return COLLECTIONS.find((c) => c.rarity === rarity)!;
  }
  return pickRedCollection(seed * 7919 % 1 || 0.5, source === "enemy" ? undefined : CONTAINERS[source]);
}

export function getRandomInt(min: number, max: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function sampleBuffCards(owned: BuffStack[], rng: () => number = Math.random, count = 3): BuffId[] {
  const ownedIds = new Set(owned.map((b) => b.id));
  const pool = BUFFS.filter((b) => b.stackable || !ownedIds.has(b.id)).map((b) => b.id);
  const copy = [...pool];
  const result: BuffId[] = [];
  for (let i = 0; i < count && copy.length; i++) {
    const index = Math.floor(rng() * copy.length);
    result.push(copy.splice(index, 1)[0]);
  }
  return result;
}

export const UPGRADE_META = WEAPON_UPGRADES;

