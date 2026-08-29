import type { LeaderboardEntry } from "../../shared/types";
import { el, fmtCoin } from "./helpers";

export type LeaderboardType = "level" | "red";

export class LeaderboardOverlay {
  readonly root: HTMLElement;
  private activeType: LeaderboardType = "level";
  private list!: HTMLElement;
  private status!: HTMLElement;

  constructor(
    private onLoad: (type: LeaderboardType) => Promise<LeaderboardEntry[]>,
    private onClose: () => void,
  ) {
    this.root = el("div", "leaderboard-screen hidden");
    this.root.innerHTML = `
      <div class="leaderboard-card">
        <div class="leaderboard-head">
          <h2>排行榜</h2>
          <button class="ghost-button leaderboard-close">关闭</button>
        </div>
        <div class="leaderboard-tabs">
          <button class="leaderboard-tab leaderboard-level-tab active">最高关卡进度</button>
          <button class="leaderboard-tab leaderboard-red-tab">大红价值</button>
        </div>
        <div class="leaderboard-status"></div>
        <div class="leaderboard-list"></div>
      </div>
    `;
    this.list = this.root.querySelector<HTMLElement>(".leaderboard-list")!;
    this.status = this.root.querySelector<HTMLElement>(".leaderboard-status")!;
    this.root.querySelector<HTMLButtonElement>(".leaderboard-close")!.addEventListener("click", () => this.onClose());
    this.root.querySelector<HTMLButtonElement>(".leaderboard-level-tab")!.addEventListener("click", () => this.switchType("level"));
    this.root.querySelector<HTMLButtonElement>(".leaderboard-red-tab")!.addEventListener("click", () => this.switchType("red"));
  }

  show(): void {
    this.root.classList.remove("hidden");
    void this.load();
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  private switchType(type: LeaderboardType): void {
    if (type === this.activeType) return;
    this.activeType = type;
    this.root.querySelector<HTMLButtonElement>(".leaderboard-level-tab")!.classList.toggle("active", type === "level");
    this.root.querySelector<HTMLButtonElement>(".leaderboard-red-tab")!.classList.toggle("active", type === "red");
    void this.load();
  }

  private async load(): Promise<void> {
    this.list.innerHTML = "";
    this.status.textContent = "加载中...";
    try {
      const entries = await this.onLoad(this.activeType);
      if (!entries.length) {
        this.status.textContent = "暂无数据";
        return;
      }
      this.status.textContent = this.activeType === "level" ? "按最高通关进度排名" : "按收藏室大红价值排名";
      entries.forEach((entry) => {
        const row = el("div", "leaderboard-row");
        row.innerHTML = `
          <span class="leaderboard-rank rank-${entry.rank <= 3 ? entry.rank : "normal"}">${entry.rank}</span>
          <span class="leaderboard-name">${escapeHtml(entry.username)}</span>
          <span class="leaderboard-value">${this.activeType === "level" ? `${entry.value} 关` : `${fmtCoin(entry.value)} 哈哈币`}</span>
        `;
        this.list.appendChild(row);
      });
    } catch {
      this.status.textContent = "排行榜加载失败，请稍后重试";
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[char]!);
}
