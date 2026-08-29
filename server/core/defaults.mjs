export function createStarterSave(userId, level = 1, clearedLevels = 0) {
  return {
    level: Math.max(1, Math.floor(level)),
    coins: 0,
    clearedLevels: Math.max(0, Math.floor(clearedLevels)),
    ownedWeapons: [
      {
        id: `starter-${userId}`,
        kind: "g18",
        levels: { range: 1, fireRate: 1, damage: 1, pellets: 1 },
        purchasePrice: 120000,
        equipped: true,
        serial: 1,
      },
    ],
    backpack: [],
    warehouse: [],
    buffs: [],
    drawCountThisAffairs: 0,
  };
}
