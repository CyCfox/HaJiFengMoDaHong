import { BUFFS, COLLECTIONS, PLAYER_BASE, WEAPONS } from "../../shared/balance";
import {
  getBuffBonus, getEquippedWeight, getUpgradeCost, getWeaponConfig, getWeaponStats,
} from "../../shared/calculations";
import type { BuffId, BuffStack, CollectionConfig, InventoryItem, RunState, PlayerSave, WeaponInstance, WeaponKind, WeaponUpgradeKey } from "../../shared/types";
import { GameBus } from "./EventBus";

let uidCounter = 1;
const nextUid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${uidCounter++}`;

export function calculateRedValue(levels: Record<string, number>): number {
  return COLLECTIONS.reduce((sum, collection) => {
    if (collection.rarity !== "red") return sum;
    return sum + (levels[collection.id] ?? 0) * collection.price;
  }, 0);
}

export function createWeaponInstance(kind: WeaponKind, serial: number, equipped = false): WeaponInstance {
  return {
    id: nextUid("w"),
    kind,
    levels: { range: 1, fireRate: 1, damage: 1, pellets: 1 },
    purchasePrice: WEAPONS[kind].price,
    equipped,
    serial,
  };
}

export function createInitialRun(
  collectionLevels: Record<string, number> = {},
  collectionValue = calculateRedValue(collectionLevels),
  level = 1,
  clearedLevels = 0,
): RunState {
  const starter = createWeaponInstance("g18", 1, true);
  return {
    level,
    coins: 0,
    backpack: [],
    warehouse: [],
    ownedWeapons: [starter],
    buffs: [],
    maxHp: PLAYER_BASE.maxHp,
    currentHp: PLAYER_BASE.maxHp,
    maxArmor: PLAYER_BASE.maxArmor,
    currentArmor: PLAYER_BASE.maxArmor,
    moveSpeed: PLAYER_BASE.moveSpeed,
    loadCapacity: PLAYER_BASE.loadCapacity,
    backpackCapacity: PLAYER_BASE.backpackCapacity,
    pickupRadius: PLAYER_BASE.pickupRadius,
    collectionLevels: { ...collectionLevels },
    collectionValue,
    drawCountThisAffairs: 0,
    inAffairs: false,
    clearedLevels,
  };
}

class RunStore {
  state: RunState = createInitialRun();
  private listeners = new Set<() => void>();

  getState(): RunState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
    GameBus.emit("run:changed", undefined);
  }

  async hydrate(): Promise<void> {
    this.state = createInitialRun();
    this.emit();
  }

  serializeSave(): PlayerSave {
    const state = this.state;
    return {
      level: state.level,
      coins: state.coins,
      clearedLevels: state.clearedLevels,
      ownedWeapons: state.ownedWeapons.map((weapon) => ({ ...weapon, levels: { ...weapon.levels } })),
      backpack: state.backpack.map((item) => ({ ...item })),
      warehouse: state.warehouse.map((item) => ({ ...item })),
      buffs: state.buffs.map((buff) => ({ ...buff })),
      drawCountThisAffairs: state.drawCountThisAffairs,
    };
  }

  applySave(save: PlayerSave | null): void {
    const next = save ?? createInitialRun(
      { ...this.state.collectionLevels },
      this.state.collectionValue,
      this.state.level,
      this.state.clearedLevels,
    );
    this.state = createInitialRun(
      { ...this.state.collectionLevels },
      this.state.collectionValue,
      next.level,
      next.clearedLevels,
    );
    this.state.coins = next.coins;
    this.state.ownedWeapons = next.ownedWeapons.length
      ? next.ownedWeapons.map((weapon) => ({ ...weapon, levels: { ...weapon.levels } }))
      : [createWeaponInstance("g18", 1, true)];
    this.state.backpack = next.backpack.map((item) => ({ ...item }));
    this.state.warehouse = next.warehouse.map((item) => ({ ...item }));
    this.state.buffs = next.buffs.map((buff) => ({ ...buff }));
    this.state.drawCountThisAffairs = next.drawCountThisAffairs ?? 0;
    this.recalcPassiveStats();
    this.state.currentHp = this.state.maxHp;
    this.state.currentArmor = this.state.maxArmor;
    this.emit();
  }

  setCollectionLevels(levels: Record<string, number>, value?: number): void {
    const normalized: Record<string, number> = {};
    for (const [id, level] of Object.entries(levels)) {
      if (level > 0) normalized[id] = Math.max(0, Math.floor(level));
    }
    this.state.collectionLevels = normalized;
    this.state.collectionValue = value ?? calculateRedValue(normalized);
    this.emit();
  }

  getCollectionLevel(id: string): number {
    return this.state.collectionLevels[id] ?? 0;
  }

  getCollectionValue(): number {
    return this.state.collectionValue;
  }

  applyBuff(id: BuffId): void {
    const existing = this.state.buffs.find((b) => b.id === id);
    if (existing) existing.stacks += 1;
    else this.state.buffs.push({ id, stacks: 1 });
    this.recalcPassiveStats();
    this.emit();
  }

  recalcPassiveStats(): void {
    const bonus = getBuffBonus(this.state.buffs);
    const oldMaxHp = this.maxHpWithoutBuffs();
    this.state.maxHp = PLAYER_BASE.maxHp + bonus.hp;
    this.state.maxArmor = PLAYER_BASE.maxArmor + bonus.armor;
    this.state.moveSpeed = PLAYER_BASE.moveSpeed * bonus.speedMultiplier;
    this.state.backpackCapacity = PLAYER_BASE.backpackCapacity + bonus.backpack;
    this.state.pickupRadius = PLAYER_BASE.pickupRadius + (bonus.pickupMagnet ? 80 : 0);
    if (this.state.currentHp > this.state.maxHp) this.state.currentHp = this.state.maxHp;
    if (this.state.currentArmor > this.state.maxArmor) this.state.currentArmor = this.state.maxArmor;
  }

  private maxHpWithoutBuffs(): number {
    return PLAYER_BASE.maxHp;
  }

  startLevel(): void {
    this.state.inAffairs = false;
    this.state.currentHp = this.state.maxHp;
    this.state.currentArmor = this.state.maxArmor;
    this.emit();
  }

  beginNewAffairs(): void {
    this.state.inAffairs = true;
    this.state.drawCountThisAffairs = 0;
    this.emit();
  }

  exitAffairs(): void {
    this.state.inAffairs = false;
    this.emit();
  }

  advanceLevel(): void {
    this.state.level += 1;
    this.state.clearedLevels += 1;
    this.emit();
  }

  resetRun(): void {
    const level = this.state.level;
    const clearedLevels = this.state.clearedLevels;
    this.state = createInitialRun(
      { ...this.state.collectionLevels },
      this.state.collectionValue,
      level,
      clearedLevels,
    );
    this.recalcPassiveStats();
    this.emit();
  }

  hasCollection(id: string): boolean {
    return (this.state.collectionLevels[id] ?? 0) > 0;
  }

  getCollection(id: string): CollectionConfig | undefined {
    return COLLECTIONS.find((c) => c.id === id);
  }

  getBackpackUsed(): number {
    return this.state.backpack.reduce((sum, item) => sum + (this.getCollection(item.collectionId)?.slots ?? 1), 0);
  }

  addToBackpack(collectionId: string): boolean {
    if (!this.getCollection(collectionId)) return false;
    const slots = this.getCollection(collectionId)?.slots ?? 1;
    if (this.getBackpackUsed() + slots > this.state.backpackCapacity) return false;
    this.state.backpack.push({ uid: nextUid("bag"), collectionId });
    this.emit();
    return true;
  }

  discardBackpack(uid: string): void {
    this.state.backpack = this.state.backpack.filter((i) => i.uid !== uid);
    this.emit();
  }

  transferItem(uid: string): void {
    const item = this.state.backpack.find((i) => i.uid === uid);
    if (!item) return;
    this.state.backpack = this.state.backpack.filter((i) => i.uid !== uid);
    this.state.warehouse.push({ ...item, uid: nextUid("wh") });
    this.emit();
  }

  transferAll(): void {
    for (const item of [...this.state.backpack]) {
      this.state.warehouse.push({ ...item, uid: nextUid("wh") });
    }
    this.state.backpack = [];
    this.emit();
  }

  sellWarehouseItem(uid: string): void {
    const index = this.state.warehouse.findIndex((i) => i.uid === uid);
    if (index < 0) return;
    const item = this.state.warehouse[index];
    const collection = this.getCollection(item.collectionId);
    if (!collection) return;
    this.state.warehouse.splice(index, 1);
    this.state.coins += collection.price;
    this.emit();
  }

  sellAllWarehouse(): void {
    for (const item of [...this.state.warehouse]) {
      const collection = this.getCollection(item.collectionId);
      if (collection) this.state.coins += collection.price;
    }
    this.state.warehouse = [];
    this.emit();
  }

  buyWeapon(kind: WeaponKind): boolean {
    const config = WEAPONS[kind];
    if (this.state.coins < config.price) return false;
    const serial = this.state.ownedWeapons.filter((w) => w.kind === kind).length + 1;
    this.state.coins -= config.price;
    this.state.ownedWeapons.push(createWeaponInstance(kind, serial, false));
    this.emit();
    return true;
  }

  weaponWeight(instance: WeaponInstance): number {
    return getWeaponConfig(instance.kind).weight;
  }

  equippedCouldBeRemoved(instanceId: string): boolean {
    const target = this.state.ownedWeapons.find((w) => w.id === instanceId);
    if (!target || !target.equipped) return true;
    return this.state.ownedWeapons.filter((w) => w.equipped && w.id !== instanceId).length > 0;
  }

  unequipWeapon(instanceId: string): boolean {
    const target = this.state.ownedWeapons.find((w) => w.id === instanceId);
    if (!target || !target.equipped) return false;
    if (!this.equippedCouldBeRemoved(instanceId)) return false;
    target.equipped = false;
    this.emit();
    return true;
  }

  equipWeapon(instanceId: string): boolean {
    const target = this.state.ownedWeapons.find((w) => w.id === instanceId);
    if (!target || target.equipped) return false;
    target.equipped = true;
    if (getEquippedWeight(this.state.ownedWeapons) > this.state.loadCapacity) {
      target.equipped = false;
      return false;
    }
    this.emit();
    return true;
  }

  sellWeapon(instanceId: string): boolean {
    const target = this.state.ownedWeapons.find((w) => w.id === instanceId);
    if (!target) return false;
    if (target.equipped && !this.equippedCouldBeRemoved(instanceId)) return false;
    this.state.ownedWeapons = this.state.ownedWeapons.filter((w) => w.id !== instanceId);
    this.state.coins += Math.floor(target.purchasePrice * 0.5);
    this.emit();
    return true;
  }

  upgradeWeapon(instanceId: string, key: WeaponUpgradeKey): boolean {
    const target = this.state.ownedWeapons.find((w) => w.id === instanceId);
    if (!target) return false;
    const config = getWeaponConfig(target.kind);
    const cost = getUpgradeCost(config, target.levels, key);
    if (this.state.coins < cost) return false;
    this.state.coins -= cost;
    target.levels[key] += 1;
    this.emit();
    return true;
  }

  upgradeCost(instance: WeaponInstance, key: WeaponUpgradeKey): number {
    return getUpgradeCost(getWeaponConfig(instance.kind), instance.levels, key);
  }

  weaponStats(instance: WeaponInstance): ReturnType<typeof getWeaponStats> {
    return getWeaponStats(instance, this.state.buffs);
  }

  makeSubmission(id: string): { ok: boolean; reason?: string } {
    const collection = this.getCollection(id);
    if (!collection) return { ok: false, reason: "未知藏品" };
    const level = this.getCollectionLevel(id);
    if (level > 0 && collection.rarity !== "red") return { ok: false, reason: "该藏品已点亮" };
    const itemIndex = this.state.warehouse.findIndex((i) => i.collectionId === id);
    if (itemIndex < 0) return { ok: false, reason: "仓库没有该藏品" };
    return { ok: true };
  }

  consumeForSubmission(id: string, nextLevel: number, redValue?: number): void {
    const index = this.state.warehouse.findIndex((i) => i.collectionId === id);
    if (index >= 0) this.state.warehouse.splice(index, 1);
    this.state.collectionLevels[id] = Math.max(this.getCollectionLevel(id), Math.max(0, Math.floor(nextLevel)));
    this.state.collectionValue = redValue ?? calculateRedValue(this.state.collectionLevels);
    this.emit();
  }

  getBuffStacks(): ReadonlyArray<BuffStack> {
    return this.state.buffs;
  }
}

export const store = new RunStore();
export const RunStoreEvent = GameBus;
