import { AGENTS, BUFFS, COLLECTIONS, WEAPONS, WEAPON_ORDER, WEAPON_UPGRADES } from "../../shared/balance";
import { getDrawCost, getEquippedWeight, getUpgradeCost, getWeaponConfig, getWeaponStats, sampleBuffCards } from "../../shared/calculations";
import type { AgentConfig, BuffId, RunState, WeaponInstance, WeaponKind, WeaponUpgradeKey } from "../../shared/types";
import { store } from "../core/RunStore";
import { SaveGateway } from "../core/SaveGateway";
import { AudioManager } from "../audio/AudioManager";
import { projectAsset } from "../core/assets";
import { el, fmtCoin, imageEl, rarityClass, toast } from "./helpers";

type AffairsPanel = "start" | "warehouse" | "trade" | "bird" | "collection" | "agents";

export class SpecialAffairsView {
  readonly root: HTMLElement;
  private content!: HTMLElement;
  private active: AffairsPanel = "start";
  private pendingDraw: BuffId[] = [];
  private selectedDraw: BuffId | null = null;
  private selectedUids = new Set<string>();
  private suppressRender = false;
  private tradeBuyScroll: HTMLElement | null = null;
  private tradeOwnedScroll: HTMLElement | null = null;
  private selectedAgentId = AGENTS[0]?.id ?? "weilong";
  private agentAnimTimer: number | null = null;
  private agentAnimIndex = 0;

  constructor(private onStartNextLevel: () => void, private onBackToMenu: () => void) {
    this.root = el("div", "affairs-screen hidden");
    this.root.innerHTML = `
      <header class="affairs-header">
        <div class="affairs-brand"><span class="brand-dot"></span> 特勤处</div>
        <nav class="affairs-nav">
          <button data-panel="start">开始游戏</button>
          <button data-panel="warehouse">仓库</button>
          <button data-panel="trade">交易行</button>
          <button data-panel="bird">幸运鸟窝</button>
          <button data-panel="agents">干员</button>
          <button data-panel="collection">收藏室</button>
        </nav>
        <button class="ghost-button menu-back">返回主菜单</button>
      </header>
      <main class="affairs-content"></main>
    `;
    this.content = this.root.querySelector(".affairs-content")!;
    this.root.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((button) => {
      button.addEventListener("click", () => {
        AudioManager.play("click");
        this.active = (button as HTMLButtonElement).dataset.panel as AffairsPanel;
        this.pendingDraw = [];
        this.selectedDraw = null;
        this.selectedUids.clear();
        this.stopAgentAnimation();
        this.render();
      });
    });
    this.root.querySelector(".menu-back")!.addEventListener("click", () => {
      AudioManager.play("click");
      this.onBackToMenu();
    });
  }

  show(): void {
    this.root.classList.remove("hidden");
    this.render();
  }

  hide(): void {
    this.stopAgentAnimation();
    this.root.classList.add("hidden");
  }

  render(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((button) => button.classList.toggle("active", button.dataset.panel === this.active));
    if (this.active === "start") this.renderStart();
    else if (this.active === "warehouse") this.renderWarehouse();
    else if (this.active === "trade") this.renderTrade();
    else if (this.active === "bird") this.renderBird();
    else if (this.active === "agents") this.renderAgents();
    else this.renderCollection();
  }

  private renderAgents(): void {
    this.stopAgentAnimation();
    const state = store.getState();
    const agent = AGENTS.find((item) => item.id === this.selectedAgentId) ?? AGENTS[0];
    if (!agent) {
      this.content.innerHTML = "";
      this.content.appendChild(el("h2", "panel-heading", "干员"));
      this.content.appendChild(el("p", "panel-description", "暂无干员"));
      return;
    }
    this.selectedAgentId = agent.id;
    this.content.innerHTML = "";
    const page = el("div", "agent-page");
    this.content.appendChild(page);
    page.appendChild(el("h2", "panel-heading", "干员"));
    const layout = el("div", "agent-window-layout");

    const stagePanel = el("div", "agent-stage-panel");
    stagePanel.appendChild(el("div", "agent-stage-title", agent.name));
    const stage = el("div", "agent-stage");
    const stageImage = imageEl(`${agent.animationPrefix}01.png`, "agent-stage-image", agent.name);
    stage.appendChild(stageImage);
    stagePanel.appendChild(stage);
    const unlocked = store.isAgentUnlocked(agent.id);
    stagePanel.appendChild(el("div", "agent-stage-state", unlocked ? "已解锁" : `解锁费用 ${fmtCoin(agent.unlockCost)}`));
    const primary = el("button", "primary-button agent-primary-button");
    if (unlocked) {
      const selected = state.selectedAgents.includes(agent.id);
      primary.textContent = selected ? "已出战" : "出战";
      primary.classList.toggle("gold-button", selected);
      primary.addEventListener("click", () => {
        const ok = store.toggleAgentSelected(agent.id);
        if (!ok && state.selectedAgents.length >= 2) toast(this.root, "最多选择两名出战干员", "warning");
        else toast(this.root, selected ? `${agent.name} 取消出战` : `${agent.name} 已设为出战`, "success");
        this.render();
      });
    } else {
      primary.textContent = `解锁 · ${fmtCoin(agent.unlockCost)}`;
      primary.addEventListener("click", () => {
        if (!store.unlockAgent(agent.id)) {
          toast(this.root, "哈哈币不足，无法解锁", "warning");
          return;
        }
        AudioManager.play("coin");
        toast(this.root, `${agent.name} 已解锁`, "success");
        this.render();
      });
    }
    const actionRow = el("div", "agent-action-row");
    actionRow.appendChild(primary);
    if (unlocked) {
      const agentLevel = store.getAgentLevel(agent.id);
      const upgradeCost = store.getAgentUpgradeCost(agent.id);
      const agentUpgrade = el("button", "secondary-button agent-upgrade-button");
      agentUpgrade.textContent = agentLevel >= agent.maxLevel
        ? `干员升级 Lv${agentLevel}/${agent.maxLevel} 已满级`
        : `干员升级 Lv${agentLevel}/${agent.maxLevel} · ${fmtCoin(upgradeCost)}`;
      agentUpgrade.disabled = agentLevel >= agent.maxLevel || state.coins < upgradeCost;
      agentUpgrade.addEventListener("click", () => {
        if (store.upgradeAgent(agent.id)) {
          AudioManager.play("upgrade");
          toast(this.root, `${agent.name} 升级成功，召唤冷却已缩短`, "success");
          this.render();
        } else {
          toast(this.root, "哈哈币不足或已满级", "warning");
        }
      });
      actionRow.appendChild(agentUpgrade);
    }
    stagePanel.appendChild(actionRow);
    layout.appendChild(stagePanel);

    const skillPanel = el("div", "agent-skill-panel");
    skillPanel.appendChild(el("h3", "panel-subheading", "技能升级"));
    if (!unlocked) {
      skillPanel.appendChild(el("p", "panel-description", "解锁干员后开放技能升级"));
    } else {
      for (const skill of agent.skills) {
        const skillUnlocked = store.isAgentSkillUnlocked(agent.id, skill.id);
        const card = el("div", "agent-skill-card");
        card.appendChild(el("div", "agent-skill-name", skill.name));
        card.appendChild(el("div", "agent-skill-desc", skill.description));
        if (!skillUnlocked) {
          const unlock = el("button", "small-button gold", `解锁技能 ${fmtCoin(skill.unlockCost)}`);
          unlock.addEventListener("click", () => {
            if (store.unlockAgentSkill(agent.id, skill.id)) {
              AudioManager.play("coin");
              toast(this.root, `${skill.name} 已解锁`, "success");
              this.render();
            } else {
              toast(this.root, "哈哈币不足或已解锁", "warning");
            }
          });
          card.appendChild(unlock);
        } else {
          const stateText = skill.initialUnlocked ? "初始技能 · 已解锁" : "已解锁";
          card.appendChild(el("div", "agent-skill-level", stateText));
          for (const upgrade of skill.upgrades) {
            const level = store.getAgentSkillUpgradeLevel(agent.id, skill.id, upgrade.id);
            const cost = store.getAgentSkillUpgradeCost(agent.id, skill.id, upgrade.id);
            const row = el("div", "agent-skill-upgrade-row");
            row.appendChild(el("span", "agent-skill-upgrade-name", `${upgrade.name} Lv${level}/${upgrade.maxLevel}`));
            row.appendChild(el("p", "agent-skill-desc", upgrade.description));
            const button = el("button", "small-button gold", level >= upgrade.maxLevel ? "已满级" : `升级 ${fmtCoin(cost)}`);
            button.disabled = level >= upgrade.maxLevel || state.coins < cost;
            button.addEventListener("click", () => {
              if (store.upgradeAgentSkill(agent.id, skill.id, upgrade.id)) {
                AudioManager.play("upgrade");
                toast(this.root, `${upgrade.name} 升级成功`, "success");
                this.render();
              } else {
                toast(this.root, "哈哈币不足或已满级", "warning");
              }
            });
            row.appendChild(button);
            card.appendChild(row);
          }
        }
        skillPanel.appendChild(card);
      }
    }
    layout.appendChild(skillPanel);
    page.appendChild(layout);

    const selector = el("div", "agent-selector");
    for (const item of AGENTS) {
      const unlockedItem = store.isAgentUnlocked(item.id);
      const cell = el("button", `agent-selector-cell ${this.selectedAgentId === item.id ? "active" : ""} ${unlockedItem ? "" : "locked"}`);
      cell.appendChild(imageEl(item.avatar, "agent-selector-avatar", item.name));
      cell.appendChild(el("span", "agent-selector-name", item.name));
      cell.addEventListener("click", () => {
        AudioManager.play("click");
        this.selectedAgentId = item.id;
        this.render();
      });
      selector.appendChild(cell);
    }
    page.appendChild(selector);
    this.startAgentAnimation(agent, stageImage);
  }

  private startAgentAnimation(agent: AgentConfig, image: HTMLImageElement): void {
    this.stopAgentAnimation();
    let index = 0;
    const tick = () => {
      if (!image.isConnected) return;
      image.src = projectAsset(`${agent.animationPrefix}${String(index + 1).padStart(2, "0")}.png`);
      index = (index + 1) % agent.frameCount;
      this.agentAnimTimer = window.setTimeout(tick, 1000 / agent.frameRate);
    };
    tick();
  }

  private stopAgentAnimation(): void {
    if (this.agentAnimTimer !== null) {
      window.clearTimeout(this.agentAnimTimer);
      this.agentAnimTimer = null;
    }
  }

  private renderStart(): void {
    const state = store.getState();
    const equipped = state.ownedWeapons.filter((w) => w.equipped);
    const buffCount = state.buffs.reduce((a, b) => a + b.stacks, 0);
    const backpack = state.backpack.length;
    this.content.innerHTML = "";
    this.content.appendChild(el("h2", "panel-heading", "开始游戏"));
    this.content.appendChild(this.renderWalletBar());
    const grid = el("div", "start-grid");
    grid.appendChild(this.infoCard("当前角色", "哈基蜂", `${state.level} 关 · ${state.clearedLevels} 次撤离`));
    grid.appendChild(this.infoCard("生命 / 护甲", `${Math.ceil(state.currentHp)} / ${Math.ceil(state.currentArmor)}`, `上限 ${state.maxHp} / ${state.maxArmor}`));
    grid.appendChild(this.infoCard("哈哈币", fmtCoin(state.coins), "出售藏品获得"));
    grid.appendChild(this.infoCard("负重", `${state.ownedWeapons.filter((w) => w.equipped).reduce((a, w) => a + getWeaponConfig(w.kind).weight, 0).toFixed(1)} / ${state.loadCapacity}`, `${equipped.length} 把装备`));
    grid.appendChild(this.infoCard("背包", `${backpack} 件`, `容量 ${state.backpackCapacity} 格`));
    grid.appendChild(this.infoCard("BUFF", `${buffCount} 层`, `${state.buffs.length} 类 BUFF`));
    this.content.appendChild(grid);
    const start = el("button", "primary-button large-button", `进入第 ${state.level} 关`);
    start.addEventListener("click", () => {
      AudioManager.play("start");
      this.onStartNextLevel();
    });
    this.content.appendChild(start);
  }

  private renderWalletBar(includeLoad = false): HTMLElement {
    const state = store.getState();
    const used = getEquippedWeight(state.ownedWeapons);
    const bar = el("div", "affairs-wallet-bar");
    const load = includeLoad
      ? `<span class="wallet-load">枪械总重量 <b>${used.toFixed(1)} / ${state.loadCapacity}</b></span>`
      : "";
    bar.innerHTML = `<span class="wallet-coin">哈哈币 <b>${fmtCoin(state.coins)}</b></span>${load}`;
    if (includeLoad && used > state.loadCapacity) {
      bar.appendChild(el("div", "affairs-warning", "枪械总重量超过负重，无法继续装备，请先卸下部分武器"));
    }
    return bar;
  }
  private infoCard(title: string, value: string, sub: string): HTMLElement {
    return el("div", "info-card", `<div class="info-label">${title}</div><div class="info-value">${value}</div><div class="info-sub">${sub}</div>`);
  }

  private renderWarehouse(): void {
    const state = store.getState();
    this.content.innerHTML = "";
    this.content.appendChild(el("h2", "panel-heading", "仓库"));
    this.content.appendChild(this.renderWalletBar());
    const layout = el("div", "warehouse-layout");

    const bag = el("div", "inventory-panel");
    bag.appendChild(el("h3", "inventory-title", `背包 · ${state.backpack.length} 件 / ${store.getBackpackUsed()}/${state.backpackCapacity}格`));
    const bagGrid = el("div", "inventory-grid bag-grid four-col");
    const bagCellCount = Math.max(24, state.backpack.length);
    for (let i = 0; i < bagCellCount; i++) {
      const item = state.backpack[i];
      if (!item) {
        bagGrid.appendChild(this.emptyInventoryCell());
        continue;
      }
      const info = store.getCollection(item.collectionId);
      if (!info) continue;
      const cell = el("div", `inventory-cell ${rarityClass(info.rarity)}`);
      cell.appendChild(imageEl(info.asset, "inventory-icon", info.name));
      cell.appendChild(el("span", "inventory-name", info.name));
      cell.appendChild(el("span", "inventory-meta", `${info.slots}格`));
      const actions = el("div", "inventory-cell-actions");
      const transfer = el("button", "small-button", "转移");
      transfer.addEventListener("click", () => {
        AudioManager.play("transfer");
        store.transferItem(item.uid);
        this.render();
      });
      const discard = el("button", "small-button danger", "丢弃");
      discard.addEventListener("click", () => {
        AudioManager.play("denied");
        store.discardBackpack(item.uid);
        this.render();
      });
      actions.append(transfer, discard);
      cell.appendChild(actions);
      bagGrid.appendChild(cell);
    }
    bag.appendChild(bagGrid);
    const allButton = el("button", "primary-button slim-button", "一键全部转移到仓库");
    allButton.addEventListener("click", () => {
      AudioManager.play("transfer");
      store.transferAll();
      this.render();
    });
    bag.appendChild(allButton);

    const wh = el("div", "inventory-panel warehouse-panel");
    wh.appendChild(el("h3", "inventory-title", `仓库 · ${state.warehouse.length} 件（无限）`));
    const warehouseGrid = el("div", "inventory-grid warehouse-grid six-col");
    const warehouseCellCount = Math.max(36, state.warehouse.length);
    for (let i = 0; i < warehouseCellCount; i++) {
      const item = state.warehouse[i];
      if (!item) {
        warehouseGrid.appendChild(this.emptyInventoryCell());
        continue;
      }
      const info = store.getCollection(item.collectionId);
      if (!info) continue;
      const cell = el("div", `inventory-cell ${rarityClass(info.rarity)}`);
      cell.appendChild(imageEl(info.asset, "inventory-icon", info.name));
      cell.appendChild(el("span", "inventory-name", info.name));
      cell.appendChild(el("span", "inventory-meta", `${fmtCoin(info.price)}`));
      const sell = el("button", "small-button gold inventory-cell-action", "出售");
      sell.addEventListener("click", () => {
        AudioManager.play("sell");
        store.sellWarehouseItem(item.uid);
        this.render();
      });
      cell.appendChild(sell);
      warehouseGrid.appendChild(cell);
    }
    wh.appendChild(warehouseGrid);
    const sellAll = el("button", "primary-button slim-button danger", "一键出售仓库全部藏品");
    sellAll.addEventListener("click", () => {
      AudioManager.play("sell");
      store.sellAllWarehouse();
      this.render();
    });
    wh.appendChild(sellAll);

    layout.append(bag, wh);
    this.content.appendChild(layout);
  }

  private emptyInventoryCell(): HTMLElement {
    const cell = el("div", "inventory-cell inventory-empty");
    cell.appendChild(el("span", "inventory-placeholder", "空"));
    return cell;
  }
  private renderTrade(): void {
    const state = store.getState();
    let layout = this.content.querySelector<HTMLElement>(".trade-layout");
    if (!layout) {
      this.content.innerHTML = "";
      this.content.appendChild(el("h2", "panel-heading", "交易行"));
      this.content.appendChild(this.renderWalletBar(true));
      layout = el("div", "trade-layout");
      this.content.appendChild(layout);
    } else {
      const oldWallet = this.content.querySelector<HTMLElement>(".affairs-wallet-bar");
      const newWallet = this.renderWalletBar(true);
      if (oldWallet) oldWallet.replaceWith(newWallet);
    }

    let buyColumn = layout.querySelector<HTMLElement>(".buy-column");
    if (!buyColumn) {
      buyColumn = el("div", "trade-column buy-column");
      buyColumn.appendChild(el("h3", "section-title", "购买枪械"));
      const buyScroll = el("div", "trade-scroll");
      buyColumn.appendChild(buyScroll);
      layout.appendChild(buyColumn);
    }
    let ownedColumn = layout.querySelector<HTMLElement>(".owned-column");
    if (!ownedColumn) {
      ownedColumn = el("div", "trade-column owned-column");
      ownedColumn.appendChild(el("h3", "section-title", "已购买枪械"));
      const ownedScroll = el("div", "owned-list owned-scroll");
      ownedColumn.appendChild(ownedScroll);
      layout.appendChild(ownedColumn);
    }

    const buyScroll = buyColumn.querySelector<HTMLElement>(".trade-scroll")!;
    const ownedScroll = ownedColumn.querySelector<HTMLElement>(".owned-scroll")!;
    this.tradeBuyScroll = buyScroll;
    this.tradeOwnedScroll = ownedScroll;
    const buyScrollTop = buyScroll.scrollTop;
    const ownedScrollTop = ownedScroll.scrollTop;
    buyScroll.innerHTML = "";
    ownedScroll.innerHTML = "";

    const buyGrid = el("div", "weapon-grid buy-grid");
    WEAPON_ORDER.forEach((kind) => {
      const config = WEAPONS[kind];
      const card = el("div", "weapon-card buy-card");
      card.appendChild(imageEl(config.asset, "weapon-art", config.name));
      card.appendChild(el("div", "weapon-name", config.name));
      card.appendChild(el("div", "weapon-stats", `射程 ${config.baseRange} · 射速 ${config.baseFireRate} · 伤害 ${config.baseDamage} · 弹数 ${config.basePellets} · 重量 ${config.weight}`));
      const button = el("button", "secondary-button", `购买 ${fmtCoin(config.price)}`);
      button.dataset.kind = kind;
      button.disabled = state.coins < config.price;
      button.addEventListener("click", () => {
        this.beginTradePatch();
        try {
          if (store.buyWeapon(kind)) {
            AudioManager.play("equip");
            const nextState = store.getState();
            const weapon = nextState.ownedWeapons[nextState.ownedWeapons.length - 1]!;
            this.patchTradeOwnedCard(weapon.id);
            this.updateTradeWalletAndBuyButtons();
          } else {
            AudioManager.play("denied");
            toast(this.root, "哈哈币不足", "warning");
          }
        } finally {
          this.endTradePatch();
        }
      });
      card.appendChild(button);
      buyGrid.appendChild(card);
    });
    buyScroll.appendChild(buyGrid);

    if (!state.ownedWeapons.length) ownedScroll.appendChild(el("div", "empty-note", "尚未拥有枪械"));
    state.ownedWeapons.forEach((weapon) => {
      ownedScroll.appendChild(this.weaponInstanceCard(weapon, state));
    });
    buyScroll.scrollTop = buyScrollTop;
    ownedScroll.scrollTop = ownedScrollTop;
  }
  isSuppressingRender(): boolean {
    return this.suppressRender;
  }

  private beginTradePatch(): void {
    this.suppressRender = true;
  }

  private endTradePatch(): void {
    this.suppressRender = false;
  }

  private updateTradeWalletAndBuyButtons(): void {
    const state = store.getState();
    const coin = this.content.querySelector<HTMLElement>(".wallet-coin b");
    if (coin) coin.textContent = fmtCoin(state.coins);
    const load = this.content.querySelector<HTMLElement>(".wallet-load b");
    if (load) load.textContent = `${getEquippedWeight(state.ownedWeapons).toFixed(1)} / ${state.loadCapacity}`;
    const used = getEquippedWeight(state.ownedWeapons);
    const warning = this.content.querySelector<HTMLElement>(".affairs-warning");
    if (used > state.loadCapacity) {
      if (!warning) this.content.appendChild(el("div", "affairs-warning", "枪械总重量超过负重，无法继续装备，请先卸下部分武器"));
    } else if (warning) {
      warning.remove();
    }
    for (const button of this.content.querySelectorAll<HTMLButtonElement>(".buy-card button")) {
      const kind = button.dataset.kind as WeaponKind | undefined;
      if (kind) button.disabled = state.coins < WEAPONS[kind].price;
    }
  }

  private patchTradeOwnedCard(weaponId: string): void {
    const scrollTop = this.tradeOwnedScroll?.scrollTop ?? 0;
    const state = store.getState();
    const weapon = state.ownedWeapons.find((item) => item.id === weaponId);
    const current = this.tradeOwnedScroll?.querySelector<HTMLElement>(`[data-weapon-id="${weaponId}"]`);
    if (!weapon) {
      current?.remove();
      if (this.tradeOwnedScroll) this.tradeOwnedScroll.scrollTop = scrollTop;
      return;
    }
    if (current) {
      this.updateWeaponInstanceCard(current, weapon, state);
    } else {
      this.tradeOwnedScroll?.appendChild(this.weaponInstanceCard(weapon, state));
    }
    if (this.tradeOwnedScroll) this.tradeOwnedScroll.scrollTop = scrollTop;
  }
  private updateWeaponInstanceCard(card: HTMLElement, weapon: WeaponInstance, state: RunState): void {
    const config = getWeaponConfig(weapon.kind);
    const stats = store.weaponStats(weapon);
    const name = card.querySelector<HTMLElement>(".instance-name");
    if (name) name.textContent = config.name;
    const serial = card.querySelector<HTMLElement>(".serial");
    if (serial) serial.textContent = `#${weapon.serial}`;
    const equippedTag = card.querySelector<HTMLElement>(".equipped-tag");
    if (equippedTag) {
      equippedTag.textContent = weapon.equipped ? "已装备" : "";
      equippedTag.classList.toggle("hidden", !weapon.equipped);
    }
    const statsEl = card.querySelector<HTMLElement>(".weapon-stats");
    if (statsEl) statsEl.textContent = `${stats.range.toFixed(0)} 射程 · ${stats.fireRate.toFixed(2)}/s · ${stats.damage.toFixed(0)} 伤害 · ${stats.pellets} 弹 · ${stats.pierce} 贯穿 · ${config.weight} 重`;
    const equip = card.querySelector<HTMLButtonElement>(".equip-button");
    if (equip) equip.textContent = weapon.equipped ? "卸下" : "装备";
    const upgradeButtons = card.querySelectorAll<HTMLButtonElement>(".upgrade-button");
    upgradeButtons.forEach((button, index) => {
      const meta = WEAPON_UPGRADES[index];
      if (!meta) return;
      const key = meta.key as WeaponUpgradeKey;
      const cost = store.upgradeCost(weapon, key);
      const gain = key === "range"
        ? `+${Math.round(config.baseRange * 0.05)}`
        : key === "fireRate"
          ? `+${(config.baseFireRate * 0.05).toFixed(2)}/秒`
          : `+${Math.round(config.baseDamage * 0.10)}`;
      const title = button.querySelector<HTMLElement>(".upgrade-line-title");
      if (title) title.textContent = `${meta.label}LV${weapon.levels[key]}→LV${weapon.levels[key] + 1}`;
      const gainEl = button.querySelector<HTMLElement>(".upgrade-line-gain");
      if (gainEl) gainEl.textContent = `${meta.label}${gain}`;
      const costEl = button.querySelector<HTMLElement>(".upgrade-line-cost");
      if (costEl) costEl.textContent = `花费${fmtCoin(cost)}`;
      button.disabled = state.coins < cost;
    });
  }
  private weaponInstanceCard(weapon: WeaponInstance, state: RunState): HTMLElement {
    const card = el("div", "weapon-instance-card");
    card.dataset.weaponId = weapon.id;
    this.fillWeaponInstanceCard(card, weapon, state);
    return card;
  }

  private fillWeaponInstanceCard(card: HTMLElement, weapon: WeaponInstance, state: RunState): void {
    const config = getWeaponConfig(weapon.kind);
    const stats = store.weaponStats(weapon);
    card.replaceChildren();
    card.appendChild(imageEl(config.asset, "weapon-art small-art", config.name));
    const body = el("div", "weapon-instance-body");
    const title = el("div", "instance-title");
    title.append(
      el("span", "instance-name", config.name),
      el("span", "serial", `#${weapon.serial}`),
      el("span", `equipped-tag${weapon.equipped ? "" : " hidden"}`, weapon.equipped ? "已装备" : ""),
    );
    body.appendChild(title);
    body.appendChild(el("div", "weapon-stats", `${stats.range.toFixed(0)} 射程 · ${stats.fireRate.toFixed(2)}/s · ${stats.damage.toFixed(0)} 伤害 · ${stats.pellets} 弹 · ${stats.pierce} 贯穿 · ${config.weight} 重`));
    const actions = el("div", "weapon-actions");
    const equip = el("button", "equip-button", weapon.equipped ? "卸下" : "装备");
    equip.addEventListener("click", () => {
      this.beginTradePatch();
      try {
        const ok = weapon.equipped ? store.unequipWeapon(weapon.id) : store.equipWeapon(weapon.id);
        AudioManager.play(ok ? "equip" : "denied");
        if (!ok && !weapon.equipped) toast(this.root, "装备后超出负重，无法携带", "warning");
        if (!ok && weapon.equipped) toast(this.root, "必须至少保留一把已装备武器", "warning");
        if (ok) {
          this.patchTradeOwnedCard(weapon.id);
          this.updateTradeWalletAndBuyButtons();
        }
      } finally {
        this.endTradePatch();
      }
    });
    const sell = el("button", "small-button danger", `出售 ${fmtCoin(Math.floor(weapon.purchasePrice * 0.5))}`);
    sell.addEventListener("click", () => {
      this.beginTradePatch();
      try {
        const ok = store.sellWeapon(weapon.id);
        AudioManager.play(ok ? "sell" : "denied");
        if (!ok) toast(this.root, "必须至少保留一把已装备武器", "warning");
        if (ok) {
          this.patchTradeOwnedCard(weapon.id);
          this.updateTradeWalletAndBuyButtons();
        }
      } finally {
        this.endTradePatch();
      }
    });
    actions.append(equip, sell);
    body.appendChild(actions);
    card.appendChild(body);
    const upgrades = el("div", "upgrade-row");
    WEAPON_UPGRADES.forEach((meta) => {
      const key = meta.key as WeaponUpgradeKey;
      const cost = store.upgradeCost(weapon, key);
      const gain = key === "range"
        ? `+${Math.round(config.baseRange * 0.05)}`
        : key === "fireRate"
          ? `+${(config.baseFireRate * 0.05).toFixed(2)}/秒`
          : `+${Math.round(config.baseDamage * 0.10)}`;
      const button = el("button", "upgrade-button");
      button.innerHTML = `
        <div class="upgrade-line-title">${meta.label}LV${weapon.levels[key]}→LV${weapon.levels[key] + 1}</div>
        <div class="upgrade-line-gain">${meta.label}${gain}</div>
        <div class="upgrade-line-cost">花费${fmtCoin(cost)}</div>
      `;
      button.disabled = state.coins < cost;
      button.addEventListener("click", () => {
        this.beginTradePatch();
        try {
          const ok = store.upgradeWeapon(weapon.id, key);
          AudioManager.play(ok ? "upgrade" : "denied");
          if (!ok) toast(this.root, "哈哈币不足", "warning");
          if (ok) {
            this.patchTradeOwnedCard(weapon.id);
            this.updateTradeWalletAndBuyButtons();
          }
        } finally {
          this.endTradePatch();
        }
      });
      upgrades.appendChild(button);
    });
    card.appendChild(upgrades);
  }
  private renderBird(): void {
    const state = store.getState();
    const cost = getDrawCost(state.drawCountThisAffairs);
    this.content.innerHTML = "";
    this.content.appendChild(el("h2", "panel-heading", "幸运鸟窝"));
    this.content.appendChild(this.renderWalletBar());
    this.content.appendChild(el("p", "panel-description", `本次特勤处已抽取 ${state.drawCountThisAffairs} 次 · 下次抽取 ${fmtCoin(cost)} 哈哈币`));
    const drawButton = el("button", "primary-button", `抽取 3 张 BUFF`);
    drawButton.disabled = state.coins < cost;
    drawButton.addEventListener("click", () => {
      const cards = sampleBuffCards(state.buffs);
      if (cards.length < 3) {
        AudioManager.play("denied");
        toast(this.root, "可抽取卡池不足", "warning");
        return;
      }
      AudioManager.play("draw");
      this.pendingDraw = cards;
      this.selectedDraw = null;
      this.renderDrawCards(cards);
    });
    this.content.appendChild(drawButton);

    const cards = el("div", "buff-cards");
    cards.id = "buff-choices";
    this.content.appendChild(cards);
    if (this.pendingDraw.length) this.renderDrawCards(this.pendingDraw);

    const confirm = el("button", "gold-button", "确认选择");
    confirm.id = "buff-confirm";
    confirm.addEventListener("click", () => {
      if (!this.selectedDraw) {
        AudioManager.play("denied");
        toast(this.root, "请先选择一张 BUFF", "warning");
        return;
      }
      if (store.getState().coins < cost) {
        AudioManager.play("denied");
        toast(this.root, "哈哈币不足", "danger");
        return;
      }
      store.getState().coins -= cost;
      store.applyBuff(this.selectedDraw);
      store.getState().drawCountThisAffairs += 1;
      AudioManager.play("buff_select");
      this.pendingDraw = [];
      this.selectedDraw = null;
      this.render();
      toast(this.root, "BUFF 已生效", "success");
    });
    this.content.appendChild(confirm);

    this.content.appendChild(el("h3", "section-title", "当前已有 BUFF"));
    const current = el("div", "buff-owned");
    if (!state.buffs.length) current.appendChild(el("div", "empty-note", "尚未获得 BUFF"));
    state.buffs.forEach((buffStack) => {
      const config = BUFFS.find((b) => b.id === buffStack.id)!;
      const row = el("div", `buff-owned-row buff-${config.category}`);
      row.innerHTML = `<span class="buff-stack">Lv ${buffStack.stacks}</span><b>${config.name}</b><span>${config.description}</span>`;
      current.appendChild(row);
    });
    this.content.appendChild(current);
  }

  private renderDrawCards(cards: BuffId[]): void {
    const host = this.content.querySelector<HTMLElement>("#buff-choices") ?? this.content.querySelector<HTMLElement>(".buff-cards")!;
    host.innerHTML = "";
    cards.forEach((id) => {
      const config = BUFFS.find((b) => b.id === id)!;
      const card = el("button", `buff-card buff-${config.category} ${this.selectedDraw === id ? "selected" : ""}`);
      card.innerHTML = `<div class="buff-icon">${config.icon}</div><div class="buff-name">${config.name}</div><div class="buff-desc">${config.description}</div>`;
      card.addEventListener("click", () => {
        AudioManager.play("hover");
        this.selectedDraw = id;
        this.renderDrawCards(cards);
      });
      host.appendChild(card);
    });
  }

  private renderCollection(): void {
    const state = store.getState();
    const loggedIn = Boolean(SaveGateway.getCurrentUser());
    const litCount = Object.keys(state.collectionLevels).filter((id) => state.collectionLevels[id] > 0).length;
    const totalLevel = Object.values(state.collectionLevels).reduce((sum, level) => sum + level, 0);
    this.content.innerHTML = "";
    this.content.appendChild(el("h2", "panel-heading", "收藏室"));
    this.content.appendChild(el("p", "panel-description", `已点亮 ${litCount} / ${COLLECTIONS.length} 个展柜 · 总等级 Lv${totalLevel} · 大红价值 ${fmtCoin(state.collectionValue)}`));
    const grid = el("div", "collection-grid");
    COLLECTIONS.forEach((collection) => {
      const level = state.collectionLevels[collection.id] ?? 0;
      const lit = level > 0;
      const count = state.warehouse.filter((i) => i.collectionId === collection.id).length;
      const card = el("div", `collection-card ${rarityClass(collection.rarity)} ${lit ? "lit" : ""}`);
      card.appendChild(el("div", `collection-level-badge ${lit ? "lit" : ""}`, lit ? `Lv ${level}` : "Lv 0"));
      card.appendChild(imageEl(collection.asset, "collection-art", collection.name));
      card.appendChild(el("div", "collection-name", collection.name));
      card.appendChild(el("div", "collection-detail", `${collection.rarity === "red" ? "红" : collection.rarity === "gold" ? "金" : collection.rarity === "purple" ? "紫" : "蓝"} · ${fmtCoin(collection.price)} · ${collection.slots}格 · 仓库${count}`));
      if (lit && collection.rarity !== "red") {
        card.appendChild(el("div", "lit-badge", "已点亮"));
      } else if (lit && collection.rarity === "red") {
        const submit = el("button", "small-button gold", loggedIn ? "升级展柜" : "登录后升级");
        submit.disabled = count < 1 || !loggedIn;
        submit.addEventListener("click", async () => {
          if (!loggedIn) {
            AudioManager.play("denied");
            toast(this.root, "请先登录后再提交收藏室", "warning");
            return;
          }
          const check = store.makeSubmission(collection.id);
          if (!check.ok) {
            AudioManager.play("denied");
            toast(this.root, check.reason ?? "无法提交", "warning");
            return;
          }
          try {
            const result = await SaveGateway.lightCollection(collection.id);
            store.consumeForSubmission(collection.id, result.level, result.redValue);
            AudioManager.play("submit");
            toast(this.root, `${collection.name} 升级至 Lv${result.level}`, "success");
            this.render();
          } catch {
            AudioManager.play("denied");
            toast(this.root, "网络或服务异常，藏品未消耗，请重试", "danger");
          }
        });
        card.appendChild(submit);
      } else {
        const submit = el("button", "small-button gold", loggedIn ? "提交点亮" : "登录后提交");
        submit.disabled = count < 1 || !loggedIn;
        submit.addEventListener("click", async () => {
          if (!loggedIn) {
            AudioManager.play("denied");
            toast(this.root, "请先登录后再提交收藏室", "warning");
            return;
          }
          const check = store.makeSubmission(collection.id);
          if (!check.ok) {
            AudioManager.play("denied");
            toast(this.root, check.reason ?? "无法提交", "warning");
            return;
          }
          try {
            const result = await SaveGateway.lightCollection(collection.id);
            store.consumeForSubmission(collection.id, result.level, result.redValue);
            AudioManager.play("submit");
            toast(this.root, `${collection.name} 已点亮（Lv${result.level}）`, "success");
            this.render();
          } catch {
            AudioManager.play("denied");
            toast(this.root, "网络或服务异常，藏品未消耗，请重试", "danger");
          }
        });
        card.appendChild(submit);
      }
      card.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button")) return;
        this.openCollectionModal(collection.id, level);
      });
      grid.appendChild(card);
    });
    this.content.appendChild(grid);
  }

  private openCollectionModal(collectionId: string, level = 0): void {
    const info = store.getCollection(collectionId);
    if (!info) return;
    const overlay = el("div", "modal-overlay");
    const modal = el("div", "collection-modal");
    modal.appendChild(imageEl(info.asset, "collection-modal-art", info.name));
    modal.appendChild(el("h3", "modal-title", info.name));
    modal.appendChild(el("p", "modal-text", `${info.rarity} 品质 · ${info.price.toLocaleString("zh-CN")} 哈哈币 · ${info.slots} 格 · 展柜 Lv${level}`));
    const close = el("button", "primary-button", "关闭");
    close.addEventListener("click", () => overlay.remove());
    modal.appendChild(close);
    overlay.appendChild(modal);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }
}



