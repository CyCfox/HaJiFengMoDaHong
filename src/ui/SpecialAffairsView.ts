import { BUFFS, COLLECTIONS, WEAPONS, WEAPON_ORDER, WEAPON_UPGRADES } from "../../shared/balance";
import { getDrawCost, getUpgradeCost, getWeaponConfig, getWeaponStats, sampleBuffCards } from "../../shared/calculations";
import type { BuffId, RunState, WeaponInstance, WeaponKind, WeaponUpgradeKey } from "../../shared/types";
import { store } from "../core/RunStore";
import { SaveGateway } from "../core/SaveGateway";
import { AudioManager } from "../audio/AudioManager";
import { el, fmtCoin, imageEl, rarityClass, toast } from "./helpers";

type AffairsPanel = "start" | "warehouse" | "trade" | "bird" | "collection";

export class SpecialAffairsView {
  readonly root: HTMLElement;
  private content!: HTMLElement;
  private active: AffairsPanel = "start";
  private pendingDraw: BuffId[] = [];
  private selectedDraw: BuffId | null = null;
  private selectedUids = new Set<string>();

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
    this.root.classList.add("hidden");
  }

  render(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((button) => button.classList.toggle("active", button.dataset.panel === this.active));
    if (this.active === "start") this.renderStart();
    else if (this.active === "warehouse") this.renderWarehouse();
    else if (this.active === "trade") this.renderTrade();
    else if (this.active === "bird") this.renderBird();
    else this.renderCollection();
  }

  private renderStart(): void {
    const state = store.getState();
    const equipped = state.ownedWeapons.filter((w) => w.equipped);
    const buffCount = state.buffs.reduce((a, b) => a + b.stacks, 0);
    const backpack = state.backpack.length;
    this.content.innerHTML = "";
    this.content.appendChild(el("h2", "panel-heading", "开始游戏"));
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

  private infoCard(title: string, value: string, sub: string): HTMLElement {
    return el("div", "info-card", `<div class="info-label">${title}</div><div class="info-value">${value}</div><div class="info-sub">${sub}</div>`);
  }

  private renderWarehouse(): void {
    const state = store.getState();
    this.content.innerHTML = "";
    this.content.appendChild(el("h2", "panel-heading", "仓库"));
    const layout = el("div", "warehouse-layout");

    const bag = el("div", "inventory-panel");
    bag.appendChild(el("h3", "inventory-title", `背包 · ${state.backpack.length} 件 / ${store.getBackpackUsed()}/${state.backpackCapacity}格`));
    if (!state.backpack.length) {
      bag.appendChild(el("div", "empty-note", "背包为空"));
    } else {
      const bagGrid = el("div", "inventory-grid bag-grid six-col");
      state.backpack.forEach((item) => {
        const info = store.getCollection(item.collectionId);
        if (!info) return;
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
      });
      bag.appendChild(bagGrid);
      const allButton = el("button", "primary-button slim-button", "一键全部转移到仓库");
      allButton.addEventListener("click", () => {
        AudioManager.play("transfer");
        store.transferAll();
        this.render();
      });
      bag.appendChild(allButton);
    }

    const wh = el("div", "inventory-panel warehouse-panel");
    wh.appendChild(el("h3", "inventory-title", `仓库 · ${state.warehouse.length} 件（无限）`));
    if (!state.warehouse.length) {
      wh.appendChild(el("div", "empty-note", "仓库为空"));
    } else {
      const warehouseGrid = el("div", "inventory-grid warehouse-grid nine-col");
      state.warehouse.forEach((item) => {
        const info = store.getCollection(item.collectionId);
        if (!info) return;
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
      });
      wh.appendChild(warehouseGrid);
      const sellAll = el("button", "primary-button slim-button danger", "一键出售仓库全部藏品");
      sellAll.addEventListener("click", () => {
        AudioManager.play("sell");
        store.sellAllWarehouse();
        this.render();
      });
      wh.appendChild(sellAll);
    }
    layout.append(bag, wh);
    this.content.appendChild(layout);
  }

  private renderTrade(): void {
    const state = store.getState();
    this.content.innerHTML = "";
    this.content.appendChild(el("h2", "panel-heading", `交易行 · 哈哈币 ${fmtCoin(state.coins)}`));
    this.content.appendChild(el("h3", "section-title", "购买枪械"));
    const buyGrid = el("div", "weapon-grid");
    WEAPON_ORDER.forEach((kind) => {
      const config = WEAPONS[kind];
      const card = el("div", "weapon-card buy-card");
      card.appendChild(imageEl(config.asset, "weapon-art", config.name));
      card.appendChild(el("div", "weapon-name", config.name));
      card.appendChild(el("div", "weapon-stats", `射程 ${config.baseRange} · 射速 ${config.baseFireRate} · 伤害 ${config.baseDamage} · 弹数 ${config.basePellets} · 重量 ${config.weight}`));
      const button = el("button", "secondary-button", `购买 ${fmtCoin(config.price)}`);
      button.disabled = state.coins < config.price;
      button.addEventListener("click", () => {
        if (store.buyWeapon(kind)) {
          AudioManager.play("equip");
          this.render();
        } else {
          AudioManager.play("denied");
          toast(this.root, "哈哈币不足", "warning");
        }
      });
      card.appendChild(button);
      buyGrid.appendChild(card);
    });
    this.content.appendChild(buyGrid);

    this.content.appendChild(el("h3", "section-title", "已购买枪械"));
    const ownedList = el("div", "owned-list");
    if (!state.ownedWeapons.length) ownedList.appendChild(el("div", "empty-note", "尚未拥有枪械"));
    state.ownedWeapons.forEach((weapon) => {
      ownedList.appendChild(this.weaponInstanceCard(weapon, state));
    });
    this.content.appendChild(ownedList);
  }

  private weaponInstanceCard(weapon: WeaponInstance, state: RunState): HTMLElement {
    const config = getWeaponConfig(weapon.kind);
    const stats = store.weaponStats(weapon);
    const card = el("div", "weapon-instance-card");
    card.appendChild(imageEl(config.asset, "weapon-art small-art", config.name));
    const body = el("div", "weapon-instance-body");
    body.innerHTML = `
      <div class="instance-title">${config.name} <span class="serial">#${weapon.serial}</span> ${weapon.equipped ? '<span class="equipped-tag">已装备</span>' : ""}</div>
      <div class="weapon-stats">${stats.range.toFixed(0)} 射程 · ${stats.fireRate.toFixed(2)}/s · ${stats.damage.toFixed(0)} 伤害 · ${stats.pellets} 弹 · ${stats.pierce} 贯穿 · ${config.weight} 重</div>
    `;
    const actions = el("div", "weapon-actions");
    const equip = el("button", "small-button", weapon.equipped ? "卸下" : "装备");
    equip.addEventListener("click", () => {
      const ok = weapon.equipped ? store.unequipWeapon(weapon.id) : store.equipWeapon(weapon.id);
      AudioManager.play(ok ? "equip" : "denied");
      if (!ok && !weapon.equipped) toast(this.root, "装备后总重量超过负重，无法装备", "warning");
      if (!ok && weapon.equipped) toast(this.root, "必须至少保留一把已装备武器", "warning");
      this.render();
    });
    const sell = el("button", "small-button danger", `出售 ${fmtCoin(Math.floor(weapon.purchasePrice * 0.5))}`);
    sell.addEventListener("click", () => {
      const ok = store.sellWeapon(weapon.id);
      AudioManager.play(ok ? "sell" : "denied");
      if (!ok) toast(this.root, "必须至少保留一把已装备武器", "warning");
      this.render();
    });
    actions.append(equip, sell);
    body.appendChild(actions);
    card.appendChild(body);
    const upgrades = el("div", "upgrade-row");
    WEAPON_UPGRADES.forEach((meta) => {
      const key = meta.key as WeaponUpgradeKey;
      const cost = store.upgradeCost(weapon, key);
      const gain = key === "pellets"
        ? "+1"
        : key === "range"
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
        const ok = store.upgradeWeapon(weapon.id, key);
        AudioManager.play(ok ? "upgrade" : "denied");
        if (!ok) toast(this.root, "哈哈币不足", "warning");
        this.render();
      });
      upgrades.appendChild(button);
    });
    card.appendChild(upgrades);
    return card;
  }

  private renderBird(): void {
    const state = store.getState();
    const cost = getDrawCost(state.drawCountThisAffairs);
    this.content.innerHTML = "";
    this.content.appendChild(el("h2", "panel-heading", "幸运鸟窝"));
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
        const submit = el("button", "small-button gold", loggedIn ? "再次提交 +1级" : "登录后升级");
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



