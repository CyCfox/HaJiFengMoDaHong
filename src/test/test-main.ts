import Phaser from "phaser";
import "../styles/main.css";
import "../styles/test.css";
import { AudioManager } from "../audio/AudioManager";
import { GameBus } from "../core/EventBus";
import { createWeaponInstance, store } from "../core/RunStore";
import { BootScene } from "../game/BootScene";
import { BattleScene } from "../game/BattleScene";
import { BattleHud } from "../ui/BattleHud";
import { AGENTS, BUFFS, COLLECTIONS, ENEMIES, WEAPON_ORDER, WEAPONS } from "../../shared/balance";
import type { BuffId, WeaponKind } from "../../shared/types";

const required = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test UI element: ${selector}`);
  return element;
};

const statusEl = required<HTMLDivElement>("#test-status");
const applyButton = required<HTMLButtonElement>("#apply-config");
const enemySelect = required<HTMLSelectElement>("#enemy-kind");
const enemyCountInput = required<HTMLInputElement>("#enemy-count");
const levelInput = required<HTMLInputElement>("#level-input");
const collectionFilter = required<HTMLInputElement>("#collection-filter");
const collectionPickup = required<HTMLInputElement>("#collection-pickup");
const battleHud = new BattleHud();
battleHud.mount(required<HTMLElement>("#game-container"));
battleHud.show();
GameBus.on("battle:hud", (payload) => battleHud.update(payload));
GameBus.on("battle:toggleBag", () => battleHud.toggleBackpack());

let game: Phaser.Game | null = null;

function setStatus(message: string, tone: "ok" | "warn" = "ok"): void {
  statusEl.dataset.tone = tone;
  statusEl.textContent = message;
}

function selectedValues(scope: string): string[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`${scope} input:checked`)).map((input) => input.value);
}

function checkedSelector(selector: string): string[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`${selector}:checked`)).map((input) => input.value);
}

function getBattleScene(): BattleScene | null {
  if (!game) return null;
  const scene = game.scene.getScene("Battle");
  return scene instanceof BattleScene ? scene : null;
}

function renderWeaponOptions(): void {
  const container = required<HTMLDivElement>("#weapon-options");
  container.innerHTML = WEAPON_ORDER.map((kind) => {
    const config = WEAPONS[kind];
    return `<label class="option-item">
      <input type="checkbox" value="${kind}" checked />
      <span class="option-name">${config.name}</span>
      <span class="option-meta">负重 ${config.weight}</span>
    </label>`;
  }).join("");
}

function syncAgentCell(cell: HTMLElement): void {
  const field = cell.querySelector<HTMLInputElement>(".agent-field-input");
  if (!field) return;
  for (const input of cell.querySelectorAll<HTMLInputElement>(".agent-skill-input")) {
    input.disabled = !field.checked;
  }
}

function renderAgentOptions(): void {
  const container = required<HTMLDivElement>("#agent-options");
  container.innerHTML = AGENTS.map((agent) => {
    const skills = agent.skills.map((skill) => `
      <label class="option-item agent-skill-choice">
        <input type="checkbox" class="agent-skill-input" value="${agent.id}:${skill.id}" ${skill.initialUnlocked ? "checked disabled" : ""} />
        <span class="option-name">${skill.name}</span>
        <span class="option-meta">${skill.initialUnlocked ? "初始技能" : `解锁 ${skill.unlockCost.toLocaleString("zh-CN")}`}</span>
      </label>`).join("");
    return `<div class="agent-test-cell" data-agent="${agent.id}">
      <label class="option-item agent-test-field-row">
        <input type="checkbox" class="agent-field-input" value="${agent.id}" />
        <span class="option-name">上阵</span>
      </label>
      <div class="agent-test-name">${agent.name}</div>
      <div class="agent-skill-list">${skills}</div>
    </div>`;
  }).join("");
  for (const cell of Array.from(container.querySelectorAll<HTMLElement>(".agent-test-cell"))) {
    const field = cell.querySelector<HTMLInputElement>(".agent-field-input");
    field?.addEventListener("change", () => syncAgentCell(cell));
    syncAgentCell(cell);
  }
}

function renderBuffOptions(): void {
  const container = required<HTMLDivElement>("#buff-options");
  container.innerHTML = BUFFS.map((buff) => `<label class="option-item">
    <input type="checkbox" value="${buff.id}" />
    <span class="option-name">${buff.name}</span>
    <span class="option-meta">${buff.description}</span>
  </label>`).join("");
}

function renderCollectionOptions(): void {
  const container = required<HTMLDivElement>("#collection-options");
  container.innerHTML = COLLECTIONS.map((collection) => `<label class="option-item collection-option" data-id="${collection.id}" data-name="${collection.name}">
    <input type="checkbox" value="${collection.id}" />
    <span class="rarity-dot rarity-${collection.rarity}"></span>
    <span class="option-name">${collection.name}</span>
    <span class="option-meta">${collection.slots}格 · ${collection.rarity}</span>
  </label>`).join("");
}

function renderEnemyOptions(): void {
  enemySelect.innerHTML = Object.entries(ENEMIES).map(([kind, config]) => `<option value="${kind}">${config.name}</option>`).join("");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.floor(value) : min));
}

function restartBattle(): void {
  const weaponIds = selectedValues("#weapon-options");
  const buffIds = selectedValues("#buff-options");
  const agentIds = checkedSelector("#agent-options .agent-field-input");
  const skillKeys = checkedSelector("#agent-options .agent-skill-input");
  if (!weaponIds.length) {
    setStatus("至少选择一把装备枪械", "warn");
    return;
  }
  if (!game) {
    setStatus("游戏尚未初始化", "warn");
    return;
  }
  if (game.scene.isActive("Battle")) game.scene.stop("Battle");

  for (const agentId of agentIds) {
    store.getState().coins = Math.max(store.getState().coins, agentIds.length ? 100000000 : 0);
    store.unlockAgent(agentId);
  }
  store.resetRun();
  const state = store.getState();
  state.inAffairs = true;
  state.selectedAgents = agentIds.slice(0, 2);
  const initialSkillKeys = new Set(AGENTS.flatMap((agent) => agent.skills.filter((skill) => skill.initialUnlocked).map((skill) => `${agent.id}:${skill.id}`)));
  state.unlockedAgentSkills = skillKeys.filter((key) => !initialSkillKeys.has(key));
  state.level = clamp(Number(levelInput.value), 1, 999);
  state.coins = 0;
  state.backpack = [];
  state.warehouse = [];
  state.buffs = [];
  state.ownedWeapons = weaponIds.map((kind, index) => createWeaponInstance(kind as WeaponKind, index + 1, true));
  state.loadCapacity = 999;
  state.backpackCapacity = 999;
  state.currentHp = state.maxHp;
  state.currentArmor = state.maxArmor;

  for (const buffId of buffIds) store.applyBuff(buffId as BuffId);

  const next = store.getState();
  next.loadCapacity = 999;
  next.backpackCapacity = 999;
  next.currentHp = next.maxHp;
  next.currentArmor = next.maxArmor;

  game.scene.start("Battle", { testMode: true });
  setStatus(`已进入测试场景：${weaponIds.length} 把武器，${buffIds.length} 个 BUFF，关卡 ${next.level}`);
}

function spawnEnemies(): void {
  const scene = getBattleScene();
  if (!scene) {
    setStatus("请先点击“应用配置并进入场景”", "warn");
    return;
  }
  const kind = enemySelect.value;
  const count = clamp(Number(enemyCountInput.value), 1, 50);
  store.getState().level = clamp(Number(levelInput.value), 1, 999);
  scene.spawnEnemyForTest(kind, count);
  setStatus(`已刷新 ${count} 个 ${ENEMIES[kind]?.name ?? kind}`);
}

function clearEnemies(): void {
  const scene = getBattleScene();
  if (!scene) return;
  scene.clearTestEnemies();
  setStatus("已清空场景敌人");
}

function dropCollections(): void {
  const scene = getBattleScene();
  if (!scene) {
    setStatus("请先点击“应用配置并进入场景”", "warn");
    return;
  }
  const ids = selectedValues("#collection-options");
  if (!ids.length) {
    setStatus("请至少选择一件藏品", "warn");
    return;
  }
  scene.spawnCollectionsForTest(ids, collectionPickup.checked);
  setStatus(`已生成 ${ids.length} 个藏品掉落（${collectionPickup.checked ? "可拾取" : "仅展示"}）`);
}

function resetPlayer(): void {
  const scene = getBattleScene();
  if (!scene) return;
  scene.resetTestPlayer();
  setStatus("玩家已恢复满血/满甲");
}

function renderAll(): void {
  renderWeaponOptions();
  renderBuffOptions();
  renderCollectionOptions();
  renderAgentOptions();
  renderEnemyOptions();
}

required<HTMLButtonElement>("#weapon-all").addEventListener("click", () => {
  for (const input of document.querySelectorAll<HTMLInputElement>("#weapon-options input")) input.checked = true;
});
required<HTMLButtonElement>("#weapon-none").addEventListener("click", () => {
  for (const input of document.querySelectorAll<HTMLInputElement>("#weapon-options input")) input.checked = false;
});
required<HTMLButtonElement>("#enemy-spawn").addEventListener("click", spawnEnemies);
required<HTMLButtonElement>("#enemy-clear").addEventListener("click", clearEnemies);
required<HTMLButtonElement>("#collection-all").addEventListener("click", () => {
  for (const input of document.querySelectorAll<HTMLInputElement>("#collection-options input")) input.checked = true;
});
required<HTMLButtonElement>("#collection-none").addEventListener("click", () => {
  for (const input of document.querySelectorAll<HTMLInputElement>("#collection-options input")) input.checked = false;
});
required<HTMLButtonElement>("#collection-drop").addEventListener("click", dropCollections);
required<HTMLButtonElement>("#collection-clear").addEventListener("click", () => {
  const scene = getBattleScene();
  if (!scene) return;
  scene.clearTestLoot();
  setStatus("已清空藏品掉落和火焰区域");
});
required<HTMLButtonElement>("#reset-player").addEventListener("click", resetPlayer);
required<HTMLButtonElement>("#agent-unlock-all").addEventListener("click", () => {
  store.getState().coins = 100000000;
  for (const agent of AGENTS) store.unlockAgent(agent.id);
  for (const input of document.querySelectorAll<HTMLInputElement>("#agent-options .agent-field-input")) input.checked = true;
  for (const input of document.querySelectorAll<HTMLInputElement>("#agent-options .agent-skill-input")) {
    if (!input.disabled) input.checked = true;
  }
  for (const cell of document.querySelectorAll<HTMLElement>("#agent-options .agent-test-cell")) syncAgentCell(cell);
  setStatus("已解锁全部干员并准备上阵");
});
required<HTMLButtonElement>("#agent-clear").addEventListener("click", () => {
  for (const input of document.querySelectorAll<HTMLInputElement>("#agent-options .agent-field-input")) input.checked = false;
  for (const input of document.querySelectorAll<HTMLInputElement>("#agent-options .agent-skill-input")) {
    if (!input.disabled) input.checked = false;
  }
  for (const cell of document.querySelectorAll<HTMLElement>("#agent-options .agent-test-cell")) syncAgentCell(cell);
  store.getState().selectedAgents = [];
  store.getState().unlockedAgentSkills = [];
  setStatus("已清空干员选择");
});
applyButton.addEventListener("click", restartBattle);

collectionFilter.addEventListener("input", () => {
  const query = collectionFilter.value.trim().toLowerCase();
  for (const label of document.querySelectorAll<HTMLElement>("#collection-options .collection-option")) {
    const name = (label.dataset.name ?? "").toLowerCase();
    const id = (label.dataset.id ?? "").toLowerCase();
    label.classList.toggle("hidden", Boolean(query) && !name.includes(query) && !id.includes(query));
  }
});

window.addEventListener("keydown", (event) => {
  const scene = getBattleScene();
  if (!scene) return;
  if (event.code === "Digit1" && !event.repeat) scene.summonAgentForTest(0);
  if (event.code === "Digit2" && !event.repeat) scene.summonAgentForTest(1);
});
document.addEventListener("pointerdown", () => AudioManager.init(), { once: true });

renderAll();
applyButton.disabled = true;

const gameConfig = {
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
} satisfies Phaser.Types.Core.GameConfig;

game = new Phaser.Game(gameConfig);

GameBus.on("boot:ready", () => {
  if (!game) return;
  applyButton.disabled = false;
  restartBattle();
});

window.addEventListener("resize", () => {
  document.documentElement.style.height = `${window.innerHeight}px`;
  document.body.style.height = `${window.innerHeight}px`;
});
document.documentElement.style.height = `${window.innerHeight}px`;
document.body.style.height = `${window.innerHeight}px`;

(window as unknown as { __hfDebug?: { game: Phaser.Game | null; store: typeof store; bus: typeof GameBus }; __hfTest?: { game: Phaser.Game | null; store: typeof store; getBattleScene: () => BattleScene | null } }).__hfDebug = {
  game,
  store,
  bus: GameBus,
};
(window as unknown as { __hfTest: { game: Phaser.Game | null; store: typeof store; getBattleScene: () => BattleScene | null } }).__hfTest = {
  game,
  store,
  getBattleScene,
};
