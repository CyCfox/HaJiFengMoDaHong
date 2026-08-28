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
await page.waitForTimeout(1200);
await page.click(".start-game");
await page.waitForTimeout(1200);

const powerLevel1 = async () => {
  await page.evaluate(() => {
    const scene = window.__hfDebug.game.scene.getScene("Battle");
    for (const mount of scene.mounts) {
      mount.weapon.levels.damage = 10000;
      mount.weapon.levels.fireRate = 100;
    }
  });
};

const clearStage = async () => {
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const scene = window.__hfDebug.game.scene.getScene("Battle");
      return {
        queue: scene.spawnQueue.length,
        enemies: scene.enemies.length,
        ready: scene.extractionReady,
        kills: scene.killCount,
        fps: window.__hfDebug.game.loop.actualFps,
        zoneVisible: scene.extractionZone?.visible ?? false,
        arrowVisible: [scene.extractionArrow, scene.extractionArrowNear, scene.extractionArrowArmed].some((text) => text?.visible),
      };
    });
    if (state.ready && state.queue === 0) return state;
  }
  throw new Error("stage did not clear within timeout");
};

await powerLevel1();
const level1 = await clearStage();
await page.evaluate(() => {
  const scene = window.__hfDebug.game.scene.getScene("Battle");
  scene.player.setPosition(scene.extractionZone.x, scene.extractionZone.y);
  scene.tryExtractKey();
});
await page.waitForTimeout(2300);
await page.click(".large-button");
await page.waitForTimeout(1200);
await powerLevel1();
const level2 = await clearStage();
await page.waitForTimeout(5000);

const finalState = await page.evaluate(() => {
  const scene = window.__hfDebug.game.scene.getScene("Battle");
  return {
    enemies: scene.enemies.length,
    queue: scene.spawnQueue.length,
    ready: scene.extractionReady,
    fps: window.__hfDebug.game.loop.actualFps,
    zoneVisible: scene.extractionZone?.visible ?? false,
    arrowVisible: [scene.extractionArrow, scene.extractionArrowNear, scene.extractionArrowArmed].some((text) => text?.visible),
  };
});

await browser.close();
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
if (!finalState.ready || finalState.enemies !== 0 || finalState.queue !== 0 || finalState.fps < 50 || !finalState.zoneVisible || !finalState.arrowVisible) {
  console.error(JSON.stringify({ level1, level2, finalState, errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ level1, level2, finalState, errors }, null, 2));
