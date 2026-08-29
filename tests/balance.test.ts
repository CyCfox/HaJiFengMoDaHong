import { describe, expect, it } from "vitest";
import { BUFFS, COLLECTIONS, WEAPONS, WEAPON_ORDER } from "../shared/balance";
import { COLLECTION_META } from "../shared/collection-meta.mjs";
import {
  getDrawCost, getEnemyComposition, getEnemyMultipliers, getEquippedWeight, getUpgradeCost,
  getWeaponSellPrice, getWeaponStats, getBuffBonus, sampleBuffCards,
} from "../shared/calculations";
import { createWeaponInstance, store } from "../src/core/RunStore";

describe("enemy composition", () => {
  it("matches exact stage formulas", () => {
    const l1 = Object.fromEntries(getEnemyComposition(1).map((x) => [x.kind, x.count]));
    const l6 = Object.fromEntries(getEnemyComposition(6).map((x) => [x.kind, x.count]));
    const l11 = Object.fromEntries(getEnemyComposition(11).map((x) => [x.kind, x.count]));
    const l21 = Object.fromEntries(getEnemyComposition(21).map((x) => [x.kind, x.count]));
    expect(l1).toEqual({ soldier: 8, shield: 0, rocket: 0, gunner: 0, flamer: 0, boss: 0 });
    expect(l6).toEqual({ soldier: 18, shield: 3, rocket: 3, gunner: 0, flamer: 0, boss: 0 });
    expect(l11).toEqual({ soldier: 28, shield: 5, rocket: 5, gunner: 5, flamer: 0, boss: 0 });
    expect(l21).toEqual({ soldier: 48, shield: 10, rocket: 10, gunner: 10, flamer: 10, boss: 0 });
    expect(getEnemyComposition(5).some((x) => x.kind === "boss" && x.count === 1)).toBe(true);
  });

  it("uses 0.01 floor and caps fire rate/speed", () => {
    expect(getEnemyMultipliers(1)).toEqual({ hp: 1, damage: 1, fireRate: 1, moveSpeed: 1 });
    const mid = getEnemyMultipliers(11);
    expect(mid.hp).toBeCloseTo(Math.floor(1.02 ** 10 * 100) / 100, 5);
    const high = getEnemyMultipliers(500);
    expect(high.fireRate).toBe(3);
    expect(high.moveSpeed).toBe(2);
  });
});

describe("weapon calculations and store behavior", () => {
  it("keeps requested prices and sale price", () => {
    expect(WEAPONS.g18.price).toBe(120000);
    expect(WEAPONS.awm.price).toBe(2300000);
    expect(getWeaponSellPrice(WEAPONS.g18)).toBe(60000);
    expect(getWeaponSellPrice(WEAPONS.awm)).toBe(1150000);
  });

  it("upgrade cost uses attribute current level independent per stat", () => {
    const instance = createWeaponInstance("g18", 1);
    expect(getUpgradeCost(WEAPONS.g18, instance.levels, "range")).toBe(12000);
    instance.levels.range = 5;
    expect(getUpgradeCost(WEAPONS.g18, instance.levels, "range")).toBe(60000);
    expect(getUpgradeCost(WEAPONS.g18, instance.levels, "damage")).toBe(12000);
  });

  it("applies unbounded upgrades and sale ignores upgrade spend", () => {
    const instance = createWeaponInstance("akm", 1);
    instance.levels.damage = 101;
    expect(getWeaponStats(instance).damage).toBeCloseTo(176, 5);
    expect(getWeaponSellPrice(WEAPONS.akm)).toBe(405000);
  });

  it("equips unlimited weapons subject only to load capacity", () => {
    store.resetRun();
    store.getState().coins = 10000000;
    for (let i = 0; i < 6; i++) {
      const weapon = createWeaponInstance("g18", i + 2);
      store.getState().ownedWeapons.push(weapon);
      weapon.equipped = true;
    }
    expect(store.getState().ownedWeapons.filter((w) => w.equipped).length).toBe(7);
    expect(getEquippedWeight(store.getState().ownedWeapons)).toBe(21);
  });

  it("cannot sell or unequip the final equipped weapon but can sell G18 when another remains", () => {
    store.resetRun();
    const starter = store.getState().ownedWeapons[0];
    expect(store.sellWeapon(starter.id)).toBe(false);
    expect(store.unequipWeapon(starter.id)).toBe(false);
    store.getState().coins = 1000000;
    expect(store.buyWeapon("g18")).toBe(true);
    const second = store.getState().ownedWeapons[1];
    expect(store.equipWeapon(second.id)).toBe(true);
    expect(store.sellWeapon(starter.id)).toBe(true);
    expect(store.getState().ownedWeapons.filter((w) => w.equipped).length).toBe(1);
  });
});

describe("drawing and buffs", () => {
  it("does not repeat cards inside one draw but may repeat across draws", () => {
    const first = sampleBuffCards([], () => 0.0);
    expect(new Set(first).size).toBe(first.length);
    const withHp = [{ id: "hp20" as const, stacks: 1 }];
    const second = sampleBuffCards(withHp, () => 0.0);
    expect(second).toContain("hp20");
  });

  it("excludes unique magnet after it is owned", () => {
    const owned = [{ id: "magnet" as const, stacks: 1 }];
    for (let i = 0; i < 20; i++) {
      const sample = sampleBuffCards(owned, () => Math.random());
      expect(sample).not.toContain("magnet");
    }
  });

  it("draw cost doubles and resets per new special-affairs session", () => {
    expect(getDrawCost(0)).toBe(50000);
    expect(getDrawCost(3)).toBe(400000);
    store.beginNewAffairs();
    expect(store.getState().drawCountThisAffairs).toBe(0);
    store.getState().drawCountThisAffairs = 2;
    store.beginNewAffairs();
    expect(store.getState().drawCountThisAffairs).toBe(0);
  });

  it("buff stacks update player and red drop chance", () => {
    store.resetRun();
    store.applyBuff("hp20");
    store.applyBuff("hp20");
    store.applyBuff("redChance");
    const bonus = getBuffBonus(store.getState().buffs);
    expect(bonus.hp).toBe(40);
    expect(bonus.redChance).toBe(1);
  });

  it("has exactly the 16 specified buffs and 15 collections", () => {
    expect(BUFFS).toHaveLength(16);
    expect(COLLECTIONS).toHaveLength(15);
    expect(WEAPON_ORDER).toHaveLength(4);
  });

  it("keeps backend collection meta in sync with game balance", () => {
    expect(COLLECTION_META.map(({ id, rarity, price }) => ({ id, rarity, price }))).toEqual(
      COLLECTIONS.map(({ id, rarity, price }) => ({ id, rarity, price })),
    );
  });
});
