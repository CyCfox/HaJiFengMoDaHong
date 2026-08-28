import Phaser from "phaser";
import "./styles/main.css";
import { AudioManager } from "./audio/AudioManager";
import { GameBus } from "./core/EventBus";
import { store } from "./core/RunStore";
import { SaveGateway } from "./core/SaveGateway";
import { BootScene } from "./game/BootScene";
import { BattleScene } from "./game/BattleScene";
import { UIApp } from "./ui/UIApp";

const ui = new UIApp({
  startGame() {
    game.scene.start("Battle");
  },
  startNextLevel() {
    store.startLevel();
    game.scene.start("Battle");
  },
  openAffairs() {
    store.beginNewAffairs();
  },
  backToMenu() {
    game.scene.stop("Battle");
    store.exitAffairs();
  },
  resumeGame() {
    game.scene.resume("Battle");
  },
  quitToMenu() {
    game.scene.stop("Battle");
    store.exitAffairs();
  },
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-container",
  width: 1280,
  height: 720,
  backgroundColor: "#10140f",
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [BootScene, BattleScene],
});

ui.showLoading();
GameBus.on("boot:ready", async () => {
  ui.hideLoading();
  try {
    const lit = await SaveGateway.loadLitCollections();
    store.setLit(lit);
  } catch {
    ui.toast("后端不可用，收藏室将只保存在当前页面", "warning");
  }
});

GameBus.on("battle:hud", (payload) => ui.battleHud.update(payload));
GameBus.on("battle:toast", (payload) => ui.toast(payload.message, payload.tone));
GameBus.on("battle:pause", () => ui.showPause());
GameBus.on("battle:toggleBag", () => ui.battleHud.toggleBackpack());
GameBus.on("battle:extracted", () => {
  store.advanceLevel();
  store.beginNewAffairs();
  ui.showAffairs();
});
GameBus.on("battle:gameover", () => {
  ui.showGameOver();
});

document.addEventListener("pointerdown", () => AudioManager.init(), { once: true });
window.addEventListener("resize", () => {
  // Phaser Scale.RESIZE handles the canvas; this keeps the app root filling the viewport.
  document.documentElement.style.height = `${window.innerHeight}px`;
  document.body.style.height = `${window.innerHeight}px`;
});
document.documentElement.style.height = `${window.innerHeight}px`;
document.body.style.height = `${window.innerHeight}px`;

const debugHandle = { game, store, bus: GameBus };
(window as unknown as { __hfDebug?: typeof debugHandle }).__hfDebug = debugHandle;
export { game };

