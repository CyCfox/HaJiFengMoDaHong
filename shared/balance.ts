import type {
  BuffConfig,
  BuffId,
  CollectionConfig,
  ContainerConfig,
  EnemyConfig,
  WeaponConfig,
  WeaponKind,
  WeaponUpgradeKey,
} from "./types";

export const PLAYER_BASE = {
  maxHp: 100,
  maxArmor: 60,
  moveSpeed: 220,
  loadCapacity: 18,
  backpackCapacity: 20,
  pickupRadius: 34,
};

export const WEAPONS: Record<string, WeaponConfig> = {
  g18: {
    kind: "g18", name: "G18 手枪", asset: "assets/weapons/carton/G18手枪.png",
    price: 120000, baseRange: 420, baseFireRate: 2.0, baseDamage: 12, basePellets: 1, pierce: 0, weight: 3, color: 0xffd54a,
  },
  uzi: {
    kind: "uzi", name: "UZI 冲锋枪", asset: "assets/weapons/carton/UZI冲锋枪.png",
    price: 350000, baseRange: 520, baseFireRate: 7.5, baseDamage: 6, basePellets: 1, pierce: 0, weight: 5, color: 0x38e3c0,
  },
  f12: {
    kind: "f12", name: "F12 霰弹枪", asset: "assets/weapons/carton/F12霰弹枪.png",
    price: 650000, baseRange: 320, baseFireRate: 1.25, baseDamage: 18, basePellets: 3, pierce: 0, weight: 7, color: 0x62d76a,
  },
  akm: {
    kind: "akm", name: "AKM 突击步枪", asset: "assets/weapons/carton/AKM突击步枪.png",
    price: 810000, baseRange: 680, baseFireRate: 4.5, baseDamage: 16, basePellets: 1, pierce: 0, weight: 8, color: 0xff9c3f,
  },
  awm: {
    kind: "awm", name: "AWM 狙击步枪", asset: "assets/weapons/carton/AWM狙击步枪.png",
    price: 2300000, baseRange: 920, baseFireRate: 0.5, baseDamage: 150, basePellets: 1, pierce: 2, weight: 15, color: 0x6be5ff,
  },
};

export const WEAPON_ORDER: WeaponKind[] = ["g18", "uzi", "f12", "akm", "awm"];

export const WEAPON_UPGRADES: Array<{
  key: WeaponUpgradeKey;
  label: string;
  growth?: number;
}> = [
  { key: "range", label: "射程", growth: 0.05 },
  { key: "fireRate", label: "射速", growth: 0.05 },
  { key: "damage", label: "伤害", growth: 0.10 },
];

export const COLLECTIONS: CollectionConfig[] = [
  { id: "maiden_pendant", name: "女郎吊坠", asset: "assets/collections/carton/女郎吊坠.png", rarity: "blue", price: 12000, slots: 2, redWeight: 0 },
  { id: "ox_horn", name: "牛角", asset: "assets/collections/carton/牛角.png", rarity: "purple", price: 18000, slots: 2, redWeight: 0 },
  { id: "asala_cup", name: "阿萨拉酒杯", asset: "assets/collections/carton/阿萨拉酒杯.png", rarity: "gold", price: 63296, slots: 1, redWeight: 0 },
  { id: "saied_watch", name: "赛伊德怀表", asset: "assets/collections/carton/赛伊德怀表.png", rarity: "red", price: 216831, slots: 1, redWeight: 18 },
  { id: "gold_bar", name: "万足金条", asset: "assets/collections/carton/万足金条.png", rarity: "red", price: 333903, slots: 2, redWeight: 16 },
  { id: "golden_gazelle", name: "黄金瞪羚", asset: "assets/collections/carton/黄金瞪羚.png", rarity: "red", price: 455560, slots: 4, redWeight: 15 },
  { id: "musket_exhibit", name: "滑膛枪展品", asset: "assets/collections/carton/滑膛枪展品.png", rarity: "red", price: 669130, slots: 4, redWeight: 14 },
  { id: "gramophone", name: "留声机", asset: "assets/collections/carton/留声机.png", rarity: "red", price: 1282036, slots: 6, redWeight: 12 },
  { id: "bust", name: "半身像", asset: "assets/collections/carton/半身像.png", rarity: "red", price: 1326548, slots: 6, redWeight: 10 },
  { id: "impressionist_painting", name: "印象派名画", asset: "assets/collections/carton/印象派名画.png", rarity: "red", price: 2105569, slots: 9, redWeight: 7 },
  { id: "tank_model", name: "主战坦克模型", asset: "assets/collections/carton/主战坦克模型.png", rarity: "red", price: 2142119, slots: 9, redWeight: 6 },
  { id: "weeping_crown", name: "万金泪冠", asset: "assets/collections/carton/万金泪冠.png", rarity: "red", price: 3184882, slots: 9, redWeight: 4 },
  { id: "colorful_bee", name: "炫彩哈基蜂", asset: "assets/collections/carton/炫彩哈基蜂.png", rarity: "red", price: 5888888, slots: 2, redWeight: 2 },
  { id: "african_heart", name: "非洲之心", asset: "assets/collections/carton/非洲之心.png", rarity: "red", price: 13141314, slots: 1, redWeight: 1 },
  { id: "ocean_tear", name: "海洋之泪", asset: "assets/collections/carton/海洋之泪.png", rarity: "red", price: 28834903, slots: 1, redWeight: 1 },
  { id: "laptop", name: "笔记本电脑", asset: "assets/collections/carton/笔记本电脑.png", rarity: "purple", price: 180000, slots: 3, redWeight: 0 },
  { id: "portable_military_radar", name: "便携式军用雷达", asset: "assets/collections/carton/便携式军用雷达.png", rarity: "gold", price: 520000, slots: 4, redWeight: 0 },
  { id: "portable_life_support", name: "便携式生命支持系统", asset: "assets/collections/carton/便携式生命支持系统.png", rarity: "purple", price: 260000, slots: 3, redWeight: 0 },
  { id: "ifv_model", name: "步战车模型", asset: "assets/collections/carton/步战车模型.png", rarity: "gold", price: 920000, slots: 6, redWeight: 0 },
  { id: "crocodile_head", name: "鳄鱼头", asset: "assets/collections/carton/鳄鱼头.png", rarity: "purple", price: 310000, slots: 4, redWeight: 0 },
  { id: "flight_recorder", name: "飞行记录仪", asset: "assets/collections/carton/飞行记录仪.png", rarity: "gold", price: 760000, slots: 4, redWeight: 0 },
  { id: "resuscitator", name: "复苏呼吸机", asset: "assets/collections/carton/复苏呼吸机.png", rarity: "gold", price: 680000, slots: 4, redWeight: 0 },
  { id: "fossil", name: "化石", asset: "assets/collections/carton/化石.png", rarity: "gold", price: 1250000, slots: 6, redWeight: 0 },
  { id: "classified_server", name: "绝密服务器", asset: "assets/collections/carton/绝密服务器.png", rarity: "red", price: 3500000, slots: 8, redWeight: 5 },
  { id: "mandel_computing_unit", name: "曼德尔超算单元", asset: "assets/collections/carton/曼德尔超算单元.png", rarity: "red", price: 8800000, slots: 6, redWeight: 3 },
  { id: "fine_porcelain", name: "名窑瓷器", asset: "assets/collections/carton/名窑瓷器.png", rarity: "gold", price: 1850000, slots: 6, redWeight: 0 },
  { id: "heaven_and_earth", name: "天圆地方", asset: "assets/collections/carton/天圆地方.png", rarity: "red", price: 15600000, slots: 7, redWeight: 2 },
  { id: "micro_nuclear_reactor", name: "微型核反应炉", asset: "assets/collections/carton/微型核反应炉.png", rarity: "red", price: 26800000, slots: 8, redWeight: 1 },
  { id: "armored_vehicle_battery", name: "装甲车电池", asset: "assets/collections/carton/装甲车电池.png", rarity: "gold", price: 1580000, slots: 5, redWeight: 0 },
  { id: "zongheng", name: "纵横", asset: "assets/collections/carton/纵横.png", rarity: "red", price: 21600000, slots: 5, redWeight: 2 },
];

export const BUFFS: BuffConfig[] = [
  { id: "hp20", name: "蜂王体质", category: "attribute", description: "最大生命 +50", stackable: true, icon: "♥" },
  { id: "armor25", name: "黄蜂装甲", category: "attribute", description: "最大护甲 +30", stackable: true, icon: "🛡" },
  { id: "speed10", name: "蜂翼疾行", category: "attribute", description: "移动速度 +10%", stackable: true, icon: "⚡" },
  { id: "bag10", name: "蜂巢扩容", category: "attribute", description: "背包容量 +10", stackable: true, icon: "🎒" },
  { id: "bag5", name: "储物蜂房", category: "attribute", description: "背包容量 +5", stackable: true, icon: "🗂" },
  { id: "load6", name: "重力蜂环", category: "attribute", description: "负重 +6", stackable: true, icon: "🧱" },
  { id: "armorRegen", name: "能工巧匠", category: "function", description: "2秒未受伤后，每秒恢复最大护甲5%", stackable: true, icon: "🔧" },
  { id: "damage15", name: "蜂刺淬炼", category: "attribute", description: "武器伤害 +15%", stackable: true, icon: "🔨" },
  { id: "fireRate8", name: "蜂群节奏", category: "attribute", description: "武器射速 +8%", stackable: true, icon: "🎶" },
  { id: "pellet1", name: "额外弹巢", category: "function", description: "所有霰弹枪弹数 +1", stackable: true, icon: "✚" },
  { id: "pierce1", name: "贯穿蜂针", category: "function", description: "所有狙击枪子弹贯穿 +1", stackable: true, icon: "➤" },
  { id: "containerExtra", name: "富饶保险箱", category: "function", description: "容器额外掉落 1 次", stackable: true, icon: "📦" },
  { id: "redChance", name: "幸运蜂吻", category: "function", description: "红色藏品概率 +1%", stackable: true, icon: "🍀" },
  { id: "burn", name: "燃烧蜂刺", category: "status", description: "命中燃烧：每0.5秒扣1%最大生命，持续2秒", stackable: true, icon: "🔥" },
  { id: "freeze", name: "冰冻蜂针", category: "status", description: "命中冰冻：减速20%，持续5秒", stackable: true, icon: "❄" },
  { id: "lifesteal2", name: "吸血蜂吻", category: "status", description: "伤害的2%转化为生命", stackable: true, icon: "🩸" },
  { id: "stun", name: "震荡蜂弹", category: "status", description: "5%概率眩晕目标1.5秒", stackable: true, icon: "💫" },
];

export const ENEMIES: Record<string, EnemyConfig> = {
  soldier: { kind: "soldier", name: "阿萨拉小兵", asset: "assets/characters/AShaLaXiaoBin/阿萨拉小兵.png", baseHp: 50, moveSpeed: 105, range: 380, fireRate: 0.55, damage: 7, pellets: 3, radius: 12, isElite: false, isBoss: false, dropChance: 0.30 },
  shield: { kind: "shield", name: "阿萨拉盾兵", asset: "assets/characters/AShaLaDunBin/阿萨拉盾兵.png", baseHp: 200, moveSpeed: 70, range: 300, fireRate: 0.8, damage: 14, pellets: 1, radius: 22, isElite: true, isBoss: false, dropChance: 0.55 },
  rocket: { kind: "rocket", name: "阿萨拉火箭兵", asset: "assets/characters/AShaLaHuoJianBin/阿萨拉火箭兵.png", baseHp: 150, moveSpeed: 85, range: 540, fireRate: 0.35, damage: 50, pellets: 1, radius: 24, isElite: true, isBoss: false, dropChance: 0.55 },
  gunner: { kind: "gunner", name: "阿萨拉机枪兵", asset: "assets/characters/AShaLaJiQiangBin/阿萨拉机枪兵.png", baseHp: 300, moveSpeed: 75, range: 540, fireRate: 2.4, damage: 10, pellets: 1, radius: 26, isElite: true, isBoss: false, dropChance: 0.55 },
  flamer: { kind: "flamer", name: "阿萨拉喷火兵", asset: "assets/characters/AShaLaPenHuoBin/阿萨拉喷火兵.png", baseHp: 250, moveSpeed: 88, range: 250, fireRate: 8, damage: 3, pellets: 1, radius: 24, isElite: true, isBoss: false, dropChance: 0.55 },
  boss: { kind: "boss", name: "卫队长官赛伊德", asset: "assets/characters/SaiYiDe/赛伊德.png", baseHp: 3000, moveSpeed: 65, range: 650, fireRate: 0.9, damage: 22, pellets: 5, radius: 26, isElite: true, isBoss: true, dropChance: 1.0 },
};

export const CONTAINERS: Record<"small" | "large", ContainerConfig> = {
  small: {
    kind: "small", name: "小保险箱", asset: "assets/containers/carton/小保险.png", openSeconds: 1.6,
    qualityWeights: { blue: 45, purple: 30, gold: 20, red: 5 }, highTierMultiplier: 3, radius: 44,
  },
  large: {
    kind: "large", name: "大保险箱", asset: "assets/containers/carton/大保险.png", openSeconds: 3.0,
    qualityWeights: { blue: 20, purple: 30, gold: 35, red: 15 }, highTierMultiplier: 5, radius: 50,
  },
};

export const MAP_ASSET = "assets/maps/大坝地图.png";
export const PLAYER_ASSET = "assets/characters/HaJiFeng/anim/idle/frames/哈基蜂_idle_frame_01.png";
export const PLAYER_FRAME_COUNT = 11;
export const PLAYER_FRAME_PREFIX = "assets/characters/HaJiFeng/anim/idle/frames/哈基蜂_idle_frame_";

export const HIGH_TIER_RED_IDS = new Set(["impressionist_painting", "tank_model", "weeping_crown", "colorful_bee", "african_heart", "ocean_tear"]);

export const DRAW_BASE_COST = 50000;
export const DRAW_FACTOR = 2;
export const BUFF_UNIQUE_IDS: BuffId[] = [];


