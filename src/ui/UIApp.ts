import { AudioManager } from "../audio/AudioManager";
import { store } from "../core/RunStore";
import { BattleHud } from "./BattleHud";
import { SpecialAffairsView } from "./SpecialAffairsView";
import { el, imageEl, toast } from "./helpers";

export interface UIActions {
  startGame(): void;
  startNextLevel(): void;
  openAffairs(): void;
  backToMenu(): void;
  resumeGame(): void;
  quitToMenu(): void;
}

export class UIApp {
  readonly root: HTMLElement;
  readonly battleHud: BattleHud;
  private loading!: HTMLElement;
  private menu!: HTMLElement;
  private gameOver!: HTMLElement;
  private pause!: HTMLElement;
  private settings!: HTMLElement;
  private instructions!: HTMLElement;
  private toastRoot!: HTMLElement;
  private affairs!: SpecialAffairsView;

  constructor(private actions: UIActions) {
    this.root = document.getElementById("ui-root")!;
    this.battleHud = new BattleHud();
    this.battleHud.mount(this.root);
    this.createLoading();
    this.createMenu();
    this.affairs = new SpecialAffairsView(() => {
      this.actions.startNextLevel();
      this.hideAll();
      this.battleHud.show();
    }, () => this.goMenu());
    this.root.appendChild(this.affairs.root);
    this.createGameOver();
    this.createPause();
    this.createInstructions();
    this.createSettings();
    this.toastRoot = el("div", "toast-root");
    this.root.appendChild(this.toastRoot);
    this.root.addEventListener("pointerover", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button")) AudioManager.play("hover", 0.12);
    });
    store.subscribe(() => {
      if (!this.affairs.root.classList.contains("hidden")) this.affairs.render();
    });
  }

  private createLoading(): void {
    this.loading = el("div", "loading-screen");
    this.loading.innerHTML = `<div class="loading-title">正在加载哈基蜂摸大红</div><div class="loading-line"></div>`;
    this.root.appendChild(this.loading);
  }

  private createMenu(): void {
    this.menu = el("div", "menu-screen");
    this.menu.innerHTML = `
      <div class="menu-bg"></div>
      <div class="menu-content">
        <div class="game-logo"></div>
        <div class="menu-buttons">
          <button class="primary-button start-game">开始游戏</button>
          <button class="secondary-button affairs-entry">特勤处</button>
          <button class="ghost-button instructions-entry">说明</button>
          <button class="ghost-button settings-entry">设置</button>
        </div>
      </div>
    `;
    const logo = this.menu.querySelector(".game-logo")!;
    logo.appendChild(imageEl("assets/title/标题.png", "menu-title-image", "哈基蜂摸大红"));
    this.menu.querySelector(".start-game")!.addEventListener("click", () => {
      AudioManager.init();
      AudioManager.play("start");
      store.resetRun();
      this.actions.startGame();
      this.hideAll();
      this.battleHud.show();
    });
    this.menu.querySelector(".affairs-entry")!.addEventListener("click", () => {
      AudioManager.init();
      AudioManager.play("click");
      this.actions.openAffairs();
      this.showAffairs();
    });
    this.menu.querySelector(".settings-entry")!.addEventListener("click", () => {
      AudioManager.init();
      AudioManager.play("click");
      this.openSettings();
    });
    this.menu.querySelector(".instructions-entry")!.addEventListener("click", () => {
      AudioManager.init();
      AudioManager.play("click");
      this.openInstructions();
    });
    this.root.appendChild(this.menu);
  }

  private createInstructions(): void {
    this.instructions = el("div", "instructions-screen hidden");
    this.instructions.innerHTML = `
      <div class="instructions-card">
        <h2>游戏说明</h2>
        <div class="help-section">
          <h3>核心玩法</h3>
          <p>在地图中自由移动，角色携带的枪械会自动索敌并朝最近的敌人开火。击败敌人、开启保险箱会掉落藏品，靠近即可拾取；背包空间不足时可以按 Tab 打开或关闭背包并主动丢弃。</p>
        </div>
        <div class="help-section">
          <h3>操作说明</h3>
          <ul>
            <li><b>W A S D</b>：上下左右移动</li>
            <li><b>Tab</b>：打开/关闭对局背包</li>
            <li><b>F</b>：到达地图中央撤离点后开始撤离</li>
            <li><b>Esc</b>：暂停并打开设置</li>
          </ul>
        </div>
        <div class="help-section">
          <h3>局内与特勤处</h3>
          <p>清空本关所有敌人后，地图中央会生成绿色撤离矩形。撤离后可进入特勤处转移、出售藏品、购买和升级枪械、抽取 BUFF、提交收藏室。</p>
        </div>
        <div class="help-section">
          <h3>奖励与失败</h3>
          <p>任何物品、哈哈币和 BUFF 都只在本局生效；角色死亡后全部清空。已经提交并点亮过的收藏室藏品会永久保留。</p>
        </div>
        <button class="primary-button instructions-close">知道了</button>
      </div>
    `;
    this.instructions.querySelector(".instructions-close")!.addEventListener("click", () => {
      AudioManager.play("click");
      this.closeInstructions();
    });
    this.root.appendChild(this.instructions);
  }

  private openInstructions(): void {
    this.instructions.classList.remove("hidden");
  }

  private closeInstructions(): void {
    this.instructions.classList.add("hidden");
  }

  private createGameOver(): void {
    this.gameOver = el("div", "gameover-screen hidden");
    this.gameOver.innerHTML = `
      <div class="gameover-card">
        <div class="gameover-title">任务失败</div>
        <div class="gameover-sub">背包、仓库、武器、哈哈币与 BUFF 已清空；收藏室点亮藏品已永久保留。</div>
        <div class="gameover-actions">
          <button class="primary-button gameover-restart">重新开始</button>
          <button class="secondary-button gameover-menu">返回主菜单</button>
        </div>
      </div>
    `;
    this.gameOver.querySelector(".gameover-restart")!.addEventListener("click", () => {
      AudioManager.play("start");
      store.resetRun();
      this.hideAll();
      this.actions.startGame();
      this.battleHud.show();
    });
    this.gameOver.querySelector(".gameover-menu")!.addEventListener("click", () => {
      AudioManager.play("click");
      store.resetRun();
      this.goMenu();
    });
    this.root.appendChild(this.gameOver);
  }

  private createPause(): void {
    this.pause = el("div", "pause-screen hidden");
    this.pause.innerHTML = `
      <div class="pause-card">
        <h2>暂停</h2>
        <button class="primary-button pause-resume">继续游戏</button>
        <button class="secondary-button pause-settings">设置</button>
        <button class="ghost-button pause-quit">返回主菜单</button>
      </div>
    `;
    this.pause.querySelector(".pause-resume")!.addEventListener("click", () => {
      AudioManager.play("click");
      this.pause.classList.add("hidden");
      this.actions.resumeGame();
    });
    this.pause.querySelector(".pause-settings")!.addEventListener("click", () => {
      AudioManager.play("click");
      this.openSettings();
    });
    this.pause.querySelector(".pause-quit")!.addEventListener("click", () => {
      AudioManager.play("click");
      this.pause.classList.add("hidden");
      store.resetRun();
      this.actions.quitToMenu();
      this.goMenu();
    });
    this.root.appendChild(this.pause);
  }

  showLoading(): void {
    this.loading.style.display = "flex";
  }

  hideLoading(): void {
    this.loading.style.display = "none";
    this.menu.classList.remove("hidden");
  }

  showMenu(): void {
    this.hideAll();
    this.menu.classList.remove("hidden");
  }

  showAffairs(): void {
    this.hideAll();
    this.affairs.show();
  }

  showGameOver(): void {
    this.hideAll();
    this.gameOver.classList.remove("hidden");
  }

  showPause(): void {
    this.pause.classList.remove("hidden");
  }

  hidePause(): void {
    this.pause.classList.add("hidden");
  }

  showBattle(): void {
    this.hideAll();
    this.battleHud.show();
  }

  toast(message: string, tone: "info" | "success" | "warning" | "danger" = "info"): void {
    toast(this.toastRoot, message, tone);
  }

  private hideAll(): void {
    this.menu.classList.add("hidden");
    this.gameOver.classList.add("hidden");
    this.pause.classList.add("hidden");
    this.instructions.classList.add("hidden");
    this.affairs.hide();
    this.battleHud.hide();
  }

  private goMenu(): void {
    this.hideAll();
    store.exitAffairs();
    this.menu.classList.remove("hidden");
  }

  private openSettings(): void {
    this.settings.classList.remove("hidden");
  }

  private closeSettings(): void {
    this.settings.classList.add("hidden");
  }

  private createSettings(): void {
    this.settings = el("div", "settings-screen hidden");
    this.settings.innerHTML = `
      <div class="settings-card">
        <h2>基础设置</h2>
        <label>总音量 <input type="range" min="0" max="100" value="70" class="setting-master"></label>
        <label>音效音量 <input type="range" min="0" max="100" value="90" class="setting-sfx"></label>
        <label><input type="checkbox" checked class="setting-audio"> 启用音效</label>
        <label>粒子质量 <select class="setting-particles"><option value="low">低</option><option value="medium" selected>中</option><option value="high">高</option></select></label>
        <button class="primary-button settings-close">保存并关闭</button>
      </div>
    `;
    const master = this.settings.querySelector<HTMLInputElement>(".setting-master")!;
    const sfx = this.settings.querySelector<HTMLInputElement>(".setting-sfx")!;
    const audio = this.settings.querySelector<HTMLInputElement>(".setting-audio")!;
    master.addEventListener("input", () => {
      AudioManager.setVolume(Number(master.value) / 100);
      localStorage.setItem("hajifeng-master-volume", master.value);
    });
    sfx.addEventListener("input", () => localStorage.setItem("hajifeng-sfx-volume", sfx.value));
    audio.addEventListener("change", () => {
      AudioManager.setEnabled(audio.checked);
      localStorage.setItem("hajifeng-audio-enabled", String(audio.checked));
    });
    this.settings.querySelector(".settings-close")!.addEventListener("click", () => {
      AudioManager.play("click");
      this.closeSettings();
    });
    this.root.appendChild(this.settings);
  }
}
