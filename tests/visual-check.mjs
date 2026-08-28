import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const base = "http://localhost:3001";
const out = resolve("qa-artifacts");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--disable-gpu", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: resolve(out, "menu.png"), fullPage: true });
const menuCheck = await page.evaluate(() => {
  const image = document.querySelector(".menu-title-image");
  return {
    titleExists: Boolean(image),
    titleLoaded: Boolean(image?.complete && image?.naturalWidth > 0),
    titleWidth: image?.naturalWidth ?? 0,
    instructionsButton: Boolean(document.querySelector(".instructions-entry")),
  };
});
await page.click(".instructions-entry");
await page.waitForTimeout(250);
const instructionsVisible = await page.locator(".instructions-screen:not(.hidden)").count();
await page.screenshot({ path: resolve(out, "instructions.png"), fullPage: true });
await page.click(".instructions-close");
await page.waitForTimeout(120);
await page.click(".start-game");
await page.waitForTimeout(1800);
await page.evaluate(() => {
  const st = window.__hfDebug.store;
  st.getState().backpack.push({ uid: "bag-visual-1", collectionId: "maiden_pendant" });
  st.getState().backpack.push({ uid: "bag-visual-2", collectionId: "ox_horn" });
  st.getState().backpack.push({ uid: "bag-visual-3", collectionId: "asala_cup" });
  st.emit();
});
await page.evaluate(() => window.__hfDebug.bus.emit("battle:toggleBag", undefined));
await page.waitForTimeout(250);
const battleBackpackCheck = await page.evaluate(() => {
  const grid = document.querySelector(".backpack-panel .backpack-grid");
  return {
    visible: !document.querySelector(".backpack-panel").classList.contains("hidden"),
    cells: document.querySelectorAll(".backpack-panel .backpack-cell").length,
    columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length : 0,
  };
});
await page.evaluate(() => window.__hfDebug.bus.emit("battle:toggleBag", undefined));
await page.waitForTimeout(150);
await page.evaluate(() => {
  const st = window.__hfDebug.store;
  st.applyBuff("hp20");
  st.applyBuff("fireRate8");
  st.applyBuff("burn");
});
await page.waitForTimeout(350);
const buffCheck = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll(".buff-item"));
  const names = items.map((item) => item.querySelector(".buff-chinese-name")?.textContent);
  const direction = getComputedStyle(document.querySelector(".buff-items")).flexDirection;
  return { names, direction, count: items.length };
});
await page.waitForTimeout(800);
const state = await page.evaluate(() => {
  const g = window.__hfDebug?.game;
  const s = g?.scene?.getScene("Battle");
  return {
    battleActive: g?.scene?.isActive("Battle"),
    enemies: s?.enemies?.length,
    queue: s?.spawnQueue?.length,
    mounts: s?.mounts?.length,
    containers: s?.containers?.length,
    playerWidth: s?.player?.displayWidth,
    mountWidth: s?.mounts?.[0]?.image?.displayWidth,
    obstacleCount: s?.obstacleGroup?.getLength(),
    centralBlocked: s?.isPointBlocked?.(512, 200, 20),
    beeInMenu: document.querySelectorAll(".logo-bee, .loading-bee").length,
  };
});
await page.screenshot({ path: resolve(out, "battle.png"), fullPage: true });

// Verify loot stays at the intended small world size instead of scaling to source resolution.
const lootCheck = await page.evaluate(async () => {
  const s = window.__hfDebug?.game?.scene?.getScene("Battle");
  s.spawnLoot(s.player.x + 20, s.player.y + 20, "enemy");
  await new Promise((r) => setTimeout(r, 350));
  const loot = s.loots[s.loots.length - 1];
  return { width: loot?.displayWidth, height: loot?.displayHeight, exists: Boolean(loot) };
});

// Container progress should only be drawn while the player is inside the range.
const containerCheck = await page.evaluate(async () => {
  const s = window.__hfDebug?.game?.scene?.getScene("Battle");
  const c = s.containers[0];
  const containersSafe = s.containers.every((item) => !s.isPointBlocked(item.x, item.y, 24));
  const before = { hint: s.containerHint.visible, commands: s.containerProgressGraphics.commandBuffer.length, containersSafe };
  s.player.setPosition(c.x, c.y);
  await new Promise((r) => setTimeout(r, 250));
  const near = { hint: s.containerHint.visible, commands: s.containerProgressGraphics.commandBuffer.length, progress: c.openProgress };
  return { before, near };
});

await page.evaluate(() => {
  const s = window.__hfDebug?.game?.scene?.getScene("Battle");
  for (const enemy of s.enemies) enemy.destroy();
  s.enemies = [];
  s.spawnQueue = [];
  s.spawnLoot(500, 200, "enemy");
  const spawnedLoot = s.loots[s.loots.length - 1];
  s.player.setPosition(512, 430);
  s.player.body.setVelocity(0, 0);
});
await page.waitForTimeout(560);
await page.evaluate(() => {
  const s = window.__hfDebug?.game?.scene?.getScene("Battle");
  const spawnedLoot = s.loots[s.loots.length - 1];
  window.__testLootSafe = !s.isPointBlocked(spawnedLoot.x, spawnedLoot.y, 10);
});
await page.waitForTimeout(100);
await page.keyboard.down("KeyW");
await page.waitForTimeout(800);
await page.keyboard.up("KeyW");
const obstacleCheck = await page.evaluate(() => {
  const s = window.__hfDebug?.game?.scene?.getScene("Battle");
  return {
    y: s.player.y,
    lootSafe: window.__testLootSafe,
    playerOutsideBuilding: !s.isPointBlocked(s.player.x, s.player.y, 0),
  };
});
const moved = await page.evaluate(() => {
  const s = window.__hfDebug?.game?.scene?.getScene("Battle");
  return { x: s?.player?.x, y: s?.player?.y, enemies: s?.enemies?.length, projectiles: s?.projectiles?.length };
});

await page.evaluate(() => {
  const s = window.__hfDebug?.game?.scene?.getScene("Battle");
  s.player.setPosition(1017, 430);
  s.player.body.setVelocity(0, 0);
});
await page.waitForTimeout(120);
await page.keyboard.down("KeyW");
await page.waitForTimeout(800);
await page.keyboard.up("KeyW");
const rightSideCheck = await page.evaluate(() => {
  const s = window.__hfDebug?.game?.scene?.getScene("Battle");
  return { x: s.player.x, y: s.player.y, outside: !s.isPointBlocked(s.player.x, s.player.y, 0) };
});

await page.evaluate(() => window.__hfDebug.bus.emit("battle:toggleBag", undefined));
await page.waitForTimeout(150);
await page.locator(".backpack-panel .backpack-cell").first().click();
await page.waitForTimeout(100);
await page.locator(".backpack-panel .danger-button").click();
await page.waitForTimeout(650);
const discardCheck = await page.evaluate(() => {
  const s = window.__hfDebug?.game?.scene?.getScene("Battle");
  const loot = s.loots[s.loots.length - 1];
  return {
    backpackCells: document.querySelectorAll(".backpack-panel .backpack-cell").length,
    lootCount: s.loots.length,
    lootNearPlayer: loot ? Math.hypot(loot.x - s.player.x, loot.y - s.player.y) < 110 : false,
    lootSafe: loot ? !s.isPointBlocked(loot.x, loot.y, 10) : false,
  };
});
await page.evaluate(() => window.__hfDebug.bus.emit("battle:toggleBag", undefined));

// Extraction zone must have an invisible point; the bar appears only after F is pressed nearby.
const extractionCheck = await page.evaluate(async () => {
  const s = window.__hfDebug?.game?.scene?.getScene("Battle");
  s.enemies = [];
  s.spawnQueue = [];
  await new Promise((r) => setTimeout(r, 100));
  s.player.setPosition(s.extractionZone.x, s.extractionZone.y);
  await new Promise((r) => setTimeout(r, 80));
  const before = { zoneVisible: s.extractionZone.visible, commands: s.extractionProgressGraphics.commandBuffer.length, text: s.extractionArrow.text, center: { x: s.extractionZone.x, y: s.extractionZone.y } };
  s.tryExtractKey();
  await new Promise((r) => setTimeout(r, 100));
  const after = { zoneVisible: s.extractionZone.visible, commands: s.extractionProgressGraphics.commandBuffer.length, armed: s.extractionArmed, text: s.extractionArrow.text };
  return { before, after };
});

await page.screenshot({ path: resolve(out, "battle-move.png"), fullPage: true });
console.log(JSON.stringify({ menuCheck, instructionsVisible, battleBackpackCheck, buffCheck, state, lootCheck, containerCheck, obstacleCheck, rightSideCheck, discardCheck, moved, extractionCheck, errors }, null, 2));
await browser.close();
