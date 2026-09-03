import { store } from "../core/RunStore";
import { GameBus } from "../core/EventBus";
import type { GameEventMap } from "../core/EventBus";
import { BUFFS } from "../../shared/balance";
import { el, fmtCoin, imageEl, rarityClass } from "./helpers";

type HudState = GameEventMap["battle:hud"];

export class BattleHud {
  readonly root: HTMLElement;
  private hpFill!: HTMLElement;
  private armorFill!: HTMLElement;
  private hpText!: HTMLElement;
  private armorText!: HTMLElement;
  private coinText!: HTMLElement;
  private levelText!: HTMLElement;
  private killText!: HTMLElement;
  private bagText!: HTMLElement;
  private loadText!: HTMLElement;
  private weaponText!: HTMLElement;
  private buffItems!: HTMLElement;
  private renderedBuffSignature = "";
  private extraction!: HTMLElement;
  private agentHud!: HTMLElement;
  private backpackPanel!: HTMLElement;
  private selectedBagUid: string | null = null;

  constructor() {
    this.root = el("div", "battle-hud hidden");
    this.root.innerHTML = `
      <div class="hud-card player-card">
        <div class="stats-row">
          <div class="hud-stat"><span class="label">生命</span><div class="bar hp-bar"><div class="bar-fill"></div></div><span class="hud-value hp-value"></span></div>
          <div class="hud-stat"><span class="label">护甲</span><div class="bar armor-bar"><div class="bar-fill"></div></div><span class="hud-value armor-value"></span></div>
        </div>
        <div class="hud-subrow">
          <span class="load-chip">负重 <b class="load-value"></b></span>
          <span class="bag-chip">背包 <b class="bag-value"></b></span>
        </div>
      </div>
      <div class="hud-card mission-card">
        <div class="mission-title">第 <b class="level-value"></b> 关</div>
        <div class="mission-sub">击杀 <b class="kill-value"></b></div>
        <div class="coin-line">哈哈币 <b class="coin-value"></b></div>
      </div>
      <div class="hud-card loadout-card">
        <div class="loadout-title">武器 <b class="weapon-value"></b></div>
        <div class="buff-list">
          <div class="buff-list-title">BUFF</div>
          <div class="buff-items"></div>
        </div>
      </div>
      <div class="extraction-chip hidden">撤离点已激活 · F 撤离</div>
      <div id="agent-hud" class="agent-hud"></div>
      <div class="hud-click-catcher"></div>
    `;
    this.hpFill = this.root.querySelector(".hp-bar .bar-fill")!;
    this.armorFill = this.root.querySelector(".armor-bar .bar-fill")!;
    this.hpText = this.root.querySelector(".hp-value")!;
    this.armorText = this.root.querySelector(".armor-value")!;
    this.coinText = this.root.querySelector(".coin-value")!;
    this.levelText = this.root.querySelector(".level-value")!;
    this.killText = this.root.querySelector(".kill-value")!;
    this.bagText = this.root.querySelector(".bag-value")!;
    this.loadText = this.root.querySelector(".load-value")!;
    this.weaponText = this.root.querySelector(".weapon-value")!;
    this.buffItems = this.root.querySelector(".buff-items")!;
    this.extraction = this.root.querySelector(".extraction-chip")!;
    this.agentHud = this.root.querySelector("#agent-hud")!;
    this.backpackPanel = el("div", "backpack-panel hidden");
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    parent.appendChild(this.backpackPanel);
  }

  show(): void {
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.backpackPanel.classList.add("hidden");
    this.selectedBagUid = null;
  }

  update(state: HudState): void {
    const hpPercent = Math.max(0, state.hp / state.maxHp) * 100;
    const armorPercent = Math.max(0, state.armor / state.maxArmor) * 100;
    this.hpFill.style.width = `${hpPercent}%`;
    this.armorFill.style.width = `${armorPercent}%`;
    this.hpText.textContent = `${Math.ceil(state.hp)}/${state.maxHp}`;
    this.armorText.textContent = `${Math.ceil(state.armor)}/${state.maxArmor}`;
    this.coinText.textContent = fmtCoin(state.coins);
    this.levelText.textContent = String(state.level);
    this.killText.textContent = String(state.kills);
    this.bagText.textContent = `${state.backpackUsed}/${state.backpackMax}`;
    this.loadText.textContent = `${state.loadUsed.toFixed(1)}/${state.loadMax}`;
    const equipped = store.getState().ownedWeapons.filter((w) => w.equipped);
    this.weaponText.textContent = `${equipped.length} 把`;
    this.renderBuffList();
    this.extraction.classList.toggle("hidden", !state.extractionReady);
    this.renderAgentHud(state.agents);
  }


  private renderBuffList(): void {
    const buffs = store.getState().buffs;
    const signature = buffs.map((stack) => `${stack.id}:${stack.stacks}`).join("|");
    if (signature === this.renderedBuffSignature) return;
    this.renderedBuffSignature = signature;
    this.buffItems.innerHTML = "";
    if (!buffs.length) {
      this.buffItems.appendChild(el("div", "buff-empty", "无"));
      return;
    }
    for (const stack of buffs) {
      const config = BUFFS.find((buff) => buff.id === stack.id);
      const item = el("div", `buff-item buff-${config?.category ?? "status"}`);
      item.innerHTML = `<span class="buff-chinese-name">${config?.name ?? stack.id}</span><span class="buff-stack-count">×${stack.stacks}</span>`;
      this.buffItems.appendChild(item);
    }
  }

  private renderAgentHud(agents: HudState["agents"]): void {
    this.agentHud.innerHTML = "";
    this.agentHud.classList.toggle("hidden", agents.length === 0);
    for (const agent of agents) {
      const progress = agent.active
        ? Math.max(0, Math.min(1, 1 - agent.remaining / agent.total))
        : agent.ready
          ? 1
          : Math.max(0, Math.min(1, 1 - agent.remaining / agent.total));
      const cell = el("div", `agent-hud-slot ${agent.active ? "active" : agent.ready ? "ready" : "cooling"}`);
      const ring = el("div", "agent-hud-ring");
      ring.style.setProperty("--agent-progress", `${progress * 360}deg`);
      ring.appendChild(imageEl(agent.avatar, "agent-hud-avatar", agent.name));
      cell.appendChild(ring);
      cell.appendChild(el("span", "agent-hud-name", agent.name));
      const status = agent.active ? "出战中" : agent.ready ? "就绪" : "冷却中";
      cell.appendChild(el("span", "agent-hud-status", status));
      this.agentHud.appendChild(cell);
    }
  }

  renderBackpack(): void {
    const state = store.getState();
    const items = state.backpack;
    this.selectedBagUid = items.some((item) => item.uid === this.selectedBagUid) ? this.selectedBagUid : null;
    this.backpackPanel.innerHTML = "";
    this.backpackPanel.appendChild(el("div", "panel-title", `对局背包 · ${items.length} 件 / ${store.getBackpackUsed()}/${state.backpackCapacity} 格`));

    if (!items.length) {
      this.backpackPanel.appendChild(el("div", "empty-note", "背包为空"));
    } else {
      const grid = el("div", "backpack-grid");
      items.forEach((item) => {
        const info = store.getCollection(item.collectionId);
        if (!info) return;
        const cell = el("button", `backpack-cell ${rarityClass(info.rarity)} ${this.selectedBagUid === item.uid ? "selected" : ""}`);
        cell.appendChild(imageEl(info.asset, "inventory-icon", info.name));
        cell.appendChild(el("span", "inventory-name", info.name));
        cell.appendChild(el("span", "inventory-meta", `${info.slots}格 · ${fmtCoin(info.price)}`));
        cell.addEventListener("click", () => {
          this.selectedBagUid = item.uid;
          this.renderBackpack();
        });
        grid.appendChild(cell);
      });
      this.backpackPanel.appendChild(grid);
      const actions = el("div", "backpack-actions");
      const discard = el("button", "primary-button danger-button", "丢弃选中藏品");
      discard.disabled = !this.selectedBagUid;
      discard.addEventListener("click", () => {
        if (!this.selectedBagUid) return;
        const selected = store.getState().backpack.find((i) => i.uid === this.selectedBagUid);
        if (!selected) return;
        store.discardBackpack(selected.uid);
        GameBus.emit("battle:discardItem", { collectionId: selected.collectionId });
        this.selectedBagUid = null;
        this.renderBackpack();
      });
      actions.appendChild(discard);
      this.backpackPanel.appendChild(actions);
    }
  }

  toggleBackpack(): void {
    if (this.backpackPanel.classList.contains("hidden")) this.renderBackpack();
    this.backpackPanel.classList.toggle("hidden");
  }

  private getUsed(): number {
    return store.getBackpackUsed();
  }
}
