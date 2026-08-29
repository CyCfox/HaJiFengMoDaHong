import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--disable-gpu", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

await page.goto("http://localhost:3001", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1400);
await page.click(".auth-register-tab");
const username = `boss_${Date.now()}`;
await page.fill(".auth-username", username);
await page.fill(".auth-password", "password123");
await page.fill(".auth-confirm", "password123");
await page.click(".auth-submit");
await page.waitForTimeout(900);
await page.click(".start-game");
await page.waitForTimeout(1000);

await page.evaluate(() => {
  const scene = window.__hfDebug.game.scene.getScene("Battle");
  for (const enemy of scene.enemies) enemy.destroy();
  scene.enemies = [];
  scene.spawnQueue = [];
  scene.spawnEnemy("boss");
  const boss = scene.enemies.find((enemy) => enemy.kind === "boss");
  boss.setPosition(scene.player.x + 80, scene.player.y);
  boss.hp = boss.maxHp * 0.2;
  boss.beginBossPhase();
  scene.fireEnemy({ enemy: boss, angle: 0, distance: 80 });
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const scene = window.__hfDebug.game.scene.getScene("Battle");
  for (const enemy of scene.enemies) {
    enemy.hp = 1;
    enemy.maxHp = 1;
  }
  for (const mount of scene.mounts) {
    mount.weapon.levels.damage = 100000;
    mount.weapon.levels.fireRate = 100;
    mount.aimAngle = 0;
    mount.resetCooldown();
  }
});
await page.waitForTimeout(3500);

const result = await page.evaluate(() => {
  const scene = window.__hfDebug.game.scene.getScene("Battle");
  return {
    kills: scene.killCount,
    enemies: scene.enemies.length,
    alive: scene.enemies.filter((enemy) => enemy.hp > 0).length,
    visibleEnemies: scene.children.list.filter(
      (object) => object.texture && String(object.texture.key).startsWith("crop_enemy_") && object.active && object.visible,
    ).length,
    visibleShadows: scene.children.list.filter(
      (object) => object.type === "Ellipse" && object.active && object.visible,
    ).length,
    ready: scene.extractionReady,
    fps: window.__hfDebug.game.loop.actualFps,
  };
});

await browser.close();
if (errors.length || result.kills < 4 || result.enemies !== 0 || result.alive !== 0 || result.visibleEnemies !== 0 || result.visibleShadows !== 0 || !result.ready || result.fps < 50) {
  console.error(JSON.stringify({ errors, result }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ errors, result }, null, 2));
