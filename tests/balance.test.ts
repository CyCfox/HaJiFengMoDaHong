import { describe, expect, it } from "vitest";
import { BUFFS, COLLECTIONS, ENEMIES, WEAPONS, WEAPON_ORDER, WEAPON_UPGRADES } from "../shared/balance";
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

  it("uses requested enemy multipliers without caps", () => {
    expect(getEnemyMultipliers(1)).toEqual({ hp: 1, damage: 1, fireRate: 1, moveSpeed: 1 });
    const mid = getEnemyMultipliers(11);
    expect(mid.hp).toBeCloseTo(Math.floor(1.1 ** 10 * 100) / 100, 5);
    expect(mid.damage).toBeCloseTo(Math.floor((1 + 0.5 * Math.sqrt(10)) * 100) / 100, 5);
    expect(mid.fireRate).toBeCloseTo(Math.floor((1 + 0.2 * Math.sqrt(10)) * 100) / 100, 5);
    expect(mid.moveSpeed).toBeCloseTo(Math.floor((1 + 0.1 * Math.sqrt(10)) * 100) / 100, 5);
    const high = getEnemyMultipliers(500);
    expect(high.fireRate).toBeGreaterThan(5);
    expect(high.moveSpeed).toBeGreaterThan(3);
  });
});

describe("weapon calculations and store behavior", () => {
  it("resets death restart to level 1 while keeping collection data", () => {
    store.resetRun();
    store.getState().level = 8;
    store.getState().clearedLevels = 7;
    store.setCollectionLevels({ gold_bar: 3 }, 999);
    store.resetRun();
    expect(store.getState().level).toBe(1);
    expect(store.getState().clearedLevels).toBe(0);
    expect(store.getCollectionLevel("gold_bar")).toBe(3);
  });

  it("removes direct pellet upgrades and keeps they only as shotgun/awm buffs", () => {
    expect(WEAPON_UPGRADES.map((item) => item.key)).toEqual(["range", "fireRate", "damage"]);
    const instance = createWeaponInstance("g18", 1);
    instance.levels.pellets = 9;
    expect(getWeaponStats(instance).pellets).toBe(1);
    const shotgun = createWeaponInstance("f12", 1);
    const awm = createWeaponInstance("awm", 1);
    expect(WEAPONS.f12.baseRange).toBe(320);
    expect(getWeaponStats(shotgun).pellets).toBe(3);
    expect(getWeaponStats(awm).pierce).toBe(2);
    store.resetRun();
    store.applyBuff("pellet1");
    store.applyBuff("pierce1");
    expect(store.weaponStats(instance).pellets).toBe(1);
    expect(store.weaponStats(shotgun).pellets).toBe(4);
    expect(store.weaponStats(awm).pierce).toBe(3);
    expect(store.weaponStats(instance).pierce).toBe(0);
  });

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
    expect(store.getState().loadCapacity).toBe(18);
    store.applyBuff("load6");
    store.applyBuff("load6");
    expect(store.getState().loadCapacity).toBe(30);
    store.applyBuff("armorRegen");
    expect(getBuffBonus(store.getState().buffs).armorRegenPercent).toBe(0.05);
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
    expect(bonus.hp).toBe(100);
    expect(bonus.redChance).toBe(1);
  });

  it("has exactly the 17 specified buffs and 30 collections", () => {
    expect(BUFFS).toHaveLength(17);
    expect(BUFFS.find((b) => b.id === "load6")?.description).toBe("负重 +6");
    expect(BUFFS.find((b) => b.id === "armorRegen")?.description).toBe("2秒未受伤后，每秒恢复最大护甲5%");
    expect(BUFFS.find((b) => b.id === "pellet1")?.description).toBe("所有霰弹枪弹数 +1");
    expect(BUFFS.find((b) => b.id === "pierce1")?.description).toBe("所有狙击枪子弹贯穿 +1");
    expect(COLLECTIONS).toHaveLength(30);
    expect(WEAPON_ORDER).toHaveLength(5);
  });

  it("matches current enemy skill tuning", () => {
    expect(ENEMIES.shield.range).toBe(300);
    expect(ENEMIES.shield.baseHp).toBe(200);
    expect(ENEMIES.rocket.damage).toBe(50);
    expect(ENEMIES.rocket.baseHp).toBe(150);
    expect(ENEMIES.gunner.damage).toBe(10);
    expect(ENEMIES.gunner.baseHp).toBe(300);
    expect(ENEMIES.flamer.baseHp).toBe(250);
    expect(ENEMIES.flamer.range).toBe(250);
  });

  it("keeps backend collection meta in sync with game balance", () => {
    expect(COLLECTION_META.map(({ id, rarity, price }) => ({ id, rarity, price }))).toEqual(
      COLLECTIONS.map(({ id, rarity, price }) => ({ id, rarity, price })),
    );
  });

  it("adds the 15 requested new red collections with specified slots", () => {
    const requested = new Map([
      ["laptop", 6],
      ["portable_military_radar", 9],
      ["portable_life_support", 4],
      ["ifv_model", 6],
      ["crocodile_head", 4],
      ["flight_recorder", 6],
      ["resuscitator", 9],
      ["fossil", 2],
      ["classified_server", 9],
      ["mandel_computing_unit", 9],
      ["fine_porcelain", 8],
      ["heaven_and_earth", 4],
      ["micro_nuclear_reactor", 9],
      ["armored_vehicle_battery", 6],
      ["zongheng", 9],
    ]);
    const subset = COLLECTIONS.filter((item) => requested.has(item.id));
    expect(subset).toHaveLength(15);
    for (const item of subset) {
      expect(item.rarity).toBe("red");
      expect(item.slots).toBe(requested.get(item.id));
    }
  });

});
