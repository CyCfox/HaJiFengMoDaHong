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
  render: {
    mipmapFilter: "LINEAR_MIPMAP_LINEAR",
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
  const auth = await SaveGateway.me();
  ui.setAccount(auth?.user.username ?? null);
  if (auth) {
    try {
      store.applySave(await SaveGateway.loadSave());
    } catch {
      ui.toast("存档加载失败，已使用默认进度", "warning");
    }
    try {
      const cabinets = await SaveGateway.loadCollections();
      const levels: Record<string, number> = {};
      for (const cabinet of cabinets) levels[cabinet.collectionId] = cabinet.level;
      store.setCollectionLevels(levels, auth.profile.redValue);
    } catch {
      ui.toast("收藏室数据加载失败，请稍后重新登录", "warning");
    }
    ui.showMenu();
  } else {
    store.setCollectionLevels({}, 0);
    ui.showLogin();
  }
});

GameBus.on("battle:hud", (payload) => ui.battleHud.update(payload));
GameBus.on("battle:toast", (payload) => ui.toast(payload.message, payload.tone));
GameBus.on("battle:pause", () => ui.showPause());
GameBus.on("battle:toggleBag", () => ui.battleHud.toggleBackpack());
GameBus.on("battle:extracted", () => {
  store.advanceLevel();
  if (SaveGateway.getCurrentUser()) {
    void SaveGateway.submitProgress(store.getState().clearedLevels).catch(() => {
      ui.toast("最高进度同步失败，稍后重新进入会重试", "warning");
    });
    void SaveGateway.saveRun(store.serializeSave()).catch(() => {
      ui.toast("关卡存档同步失败", "warning");
    });
  }
  store.beginNewAffairs();
  ui.showAffairs();
});
GameBus.on("battle:gameover", () => {
  if (SaveGateway.getCurrentUser()) {
    void SaveGateway.resetAfterDeath(1, 0).catch(() => {
      ui.toast("死亡存档重置失败，下次登录可能恢复旧状态", "warning");
    });
  }
  store.resetRun();
  ui.showGameOver();
});

let saveTimer: number | undefined;
store.subscribe(() => {
  const state = store.getState();
  if (!state.inAffairs || !SaveGateway.getCurrentUser()) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void SaveGateway.saveRun(store.serializeSave()).catch(() => {
      ui.toast("自动存档失败，请稍后重试", "warning");
    });
  }, 500);
});

document.addEventListener("pointerdown", () => AudioManager.init(), { once: true });
window.addEventListener("resize", () => {
  // Phaser Scale.RESIZE handles the canvas; this keeps the app root filling the viewport.
  document.documentElement.style.height = `${window.innerHeight}px`;
  document.body.style.height = `${window.innerHeight}px`;
});
document.documentElement.style.height = `${window.innerHeight}px`;
document.body.style.height = `${window.innerHeight}px`;

const debugHandle = { game, store, bus: GameBus, SaveGateway };
(window as unknown as { __hfDebug?: typeof debugHandle }).__hfDebug = debugHandle;
export { game };
