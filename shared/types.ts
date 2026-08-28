export type Rarity = "blue" | "purple" | "gold" | "red";
export type WeaponKind = "g18" | "uzi" | "akm" | "awm";
export type WeaponUpgradeKey = "range" | "fireRate" | "damage" | "pellets";
export type EnemyKind = "soldier" | "shield" | "rocket" | "gunner" | "flamer" | "boss";
export type ContainerKind = "small" | "large";

export interface WeaponConfig {
  kind: WeaponKind;
  name: string;
  asset: string;
  price: number;
  baseRange: number;
  baseFireRate: number;
  baseDamage: number;
  basePellets: number;
  pierce: number;
  weight: number;
  color: number;
}

export interface CollectionConfig {
  id: string;
  name: string;
  asset: string;
  rarity: Rarity;
  price: number;
  slots: number;
  redWeight: number;
}

export interface EnemyConfig {
  kind: EnemyKind;
  name: string;
  asset: string;
  baseHp: number;
  moveSpeed: number;
  range: number;
  fireRate: number;
  damage: number;
  pellets: number;
  radius: number;
  isElite: boolean;
  isBoss: boolean;
  dropChance: number;
}

export interface ContainerConfig {
  kind: ContainerKind;
  name: string;
  asset: string;
  openSeconds: number;
  qualityWeights: Record<Rarity, number>;
  highTierMultiplier: number;
  radius: number;
}

export type BuffId =
  | "hp20" | "armor25" | "speed10" | "bag10" | "bag5" | "damage15" | "fireRate8"
  | "magnet" | "pellet1" | "pierce1" | "containerExtra" | "redChance"
  | "burn" | "freeze" | "lifesteal2" | "stun";

export interface BuffConfig {
  id: BuffId;
  name: string;
  category: "attribute" | "function" | "status";
  description: string;
  stackable: boolean;
  icon: string;
}

export interface WeaponInstance {
  id: string;
  kind: WeaponKind;
  levels: Record<WeaponUpgradeKey, number>;
  purchasePrice: number;
  equipped: boolean;
  serial: number;
}

export interface InventoryItem {
  uid: string;
  collectionId: string;
}

export interface BuffStack {
  id: BuffId;
  stacks: number;
}

export interface RunState {
  level: number;
  coins: number;
  backpack: InventoryItem[];
  warehouse: InventoryItem[];
  ownedWeapons: WeaponInstance[];
  buffs: BuffStack[];
  maxHp: number;
  currentHp: number;
  maxArmor: number;
  currentArmor: number;
  moveSpeed: number;
  loadCapacity: number;
  backpackCapacity: number;
  pickupRadius: number;
  litCollectionIds: string[];
  drawCountThisAffairs: number;
  inAffairs: boolean;
  clearedLevels: number;
}
