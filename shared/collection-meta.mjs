// 后端使用的藏品元数据。前端仍以 shared/balance.ts 为运行数据源。
// 上线前若调整价格/品质，需要同步维护此文件。
export const COLLECTION_META = Object.freeze([
  { id: "maiden_pendant", name: "女郎吊坠", rarity: "blue", price: 12000 },
  { id: "ox_horn", name: "牛角", rarity: "purple", price: 18000 },
  { id: "asala_cup", name: "阿萨拉酒杯", rarity: "gold", price: 63296 },
  { id: "saied_watch", name: "赛伊德怀表", rarity: "red", price: 216831 },
  { id: "gold_bar", name: "万足金条", rarity: "red", price: 333903 },
  { id: "golden_gazelle", name: "黄金瞪羚", rarity: "red", price: 455560 },
  { id: "musket_exhibit", name: "滑膛枪展品", rarity: "red", price: 669130 },
  { id: "gramophone", name: "留声机", rarity: "red", price: 1282036 },
  { id: "bust", name: "半身像", rarity: "red", price: 1326548 },
  { id: "impressionist_painting", name: "印象派名画", rarity: "red", price: 2105569 },
  { id: "tank_model", name: "主战坦克模型", rarity: "red", price: 2142119 },
  { id: "weeping_crown", name: "万金泪冠", rarity: "red", price: 3184882 },
  { id: "colorful_bee", name: "炫彩哈基蜂", rarity: "red", price: 5888888 },
  { id: "african_heart", name: "非洲之心", rarity: "red", price: 13141314 },
  { id: "ocean_tear", name: "海洋之泪", rarity: "red", price: 28834903 },
]);

export const COLLECTION_META_BY_ID = new Map(COLLECTION_META.map((item) => [item.id, item]));
export function getCollectionMeta(id) {
  return COLLECTION_META_BY_ID.get(id) ?? null;
}
