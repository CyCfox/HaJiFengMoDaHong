import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve("qa-artifacts");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--disable-gpu", "--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:3001", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1400);
await page.click(".auth-register-tab");
const username = `e2e_${Date.now()}`;
await page.fill(".auth-username", username);
await page.fill(".auth-password", "password123");
await page.fill(".auth-confirm", "password123");
await page.click(".auth-submit");
await page.waitForTimeout(1200);
await page.click(".start-game");
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const s = window.__hfDebug.game.scene.getScene("Battle");
  s.enemies = [];
  s.spawnQueue = [];
  s.extractionReady = true;
  s.createExtractionZone();
  s.player.setPosition(s.extractionZone.x, s.extractionZone.y);
  s.tryExtractKey();
});
await page.waitForTimeout(2200);
const affairsVisible = await page.locator(".affairs-screen:not(.hidden)").count();
console.log("affairsVisible", affairsVisible, "errors", errors);

await page.evaluate(() => {
  const st = window.__hfDebug.store;
  for (let i = 0; i < 7; i++) st.getState().backpack.push({ uid: `bag-test-${i}`, collectionId: i % 2 ? "maiden_pendant" : "ox_horn" });
  for (let i = 0; i < 10; i++) st.getState().warehouse.push({ uid: `wh-test-${i}`, collectionId: i % 2 ? "asala_cup" : "gold_bar" });
  st.emit();
});
await page.click('[data-panel="warehouse"]');
await page.waitForTimeout(200);
const gridCheck = await page.evaluate(() => {
  const bag = document.querySelector(".bag-grid");
  const warehouse = document.querySelector(".warehouse-grid");
  return {
    bagCells: document.querySelectorAll(".bag-grid .inventory-cell").length,
    warehouseCells: document.querySelectorAll(".warehouse-grid .inventory-cell").length,
    bagColumns: getComputedStyle(bag).gridTemplateColumns.split(" ").filter(Boolean).length,
    warehouseColumns: getComputedStyle(warehouse).gridTemplateColumns.split(" ").filter(Boolean).length,
  };
});
console.log("gridCheck", gridCheck);
await page.click('[data-panel="trade"]');
await page.waitForTimeout(200);
await page.evaluate(() => {
  const st = window.__hfDebug.store;
  st.getState().coins = 5000000;
  st.getState().ownedWeapons.push({
    id: "test-uzi", kind: "uzi", levels: { range: 1, fireRate: 1, damage: 1, pellets: 1 }, purchasePrice: 350000, equipped: false, serial: 2,
  });
  st.emit();
});
await page.waitForTimeout(200);
await page.locator('.buy-card button').first().click();
await page.waitForTimeout(200);
const ownedCount = await page.locator(".weapon-instance-card").count();
console.log("ownedCount", ownedCount);
const upgradeText = await page.locator(".upgrade-button").first().textContent();
console.log("upgradeText", upgradeText);
await page.locator(".weapon-instance-card").first().locator(".small-button").first().click();
await page.waitForTimeout(200);
await page.locator(".upgrade-button").first().click();
await page.waitForTimeout(200);
await page.screenshot({ path: resolve(out, "trade.png"), fullPage: true });

await page.click('[data-panel="bird"]');
await page.waitForTimeout(200);
await page.locator(".primary-button").filter({ hasText: "抽取 3 张 BUFF" }).click();
await page.waitForTimeout(200);
const drawCards = await page.locator(".buff-card").count();
console.log("drawCards", drawCards);
if (drawCards) {
  await page.locator(".buff-card").first().click();
  await page.locator("#buff-confirm").click();
}
await page.waitForTimeout(300);
await page.screenshot({ path: resolve(out, "bird.png"), fullPage: true });

await page.click('[data-panel="collection"]');
await page.waitForTimeout(200);
await page.evaluate(() => {
  const st = window.__hfDebug.store;
  st.getState().warehouse.push({ uid: "submission-test", collectionId: "maiden_pendant" });
  st.emit();
});
await page.waitForTimeout(200);
const submitButtons = page.locator(".collection-card .small-button:not(:disabled)");
const submitCount = await submitButtons.count();
console.log("submitCount", submitCount);
if (submitCount) {
  await submitButtons.first().click();
  await page.waitForTimeout(500);
}
await page.screenshot({ path: resolve(out, "collection.png"), fullPage: true });
const levels = await page.evaluate(() => ({ ...window.__hfDebug.store.getState().collectionLevels }));
console.log("levels", levels, "errors", errors);

await page.click('[data-panel="start"]');
await page.waitForTimeout(200);
await page.locator(".large-button").click();
await page.waitForTimeout(1200);
const battle2 = await page.evaluate(() => {
  const game = window.__hfDebug.game;
  return { active: game.scene.isActive("Battle"), level: window.__hfDebug.store.getState().level };
});
console.log("battle2", battle2, "errors", errors);
await browser.close();



