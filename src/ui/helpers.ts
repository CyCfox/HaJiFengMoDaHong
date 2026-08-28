import { projectAsset } from "../core/assets";
import type { Rarity } from "../../shared/types";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", html = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

export function fmtCoin(value: number): string {
  return value.toLocaleString("zh-CN");
}

export function imageEl(path: string, className: string, alt = ""): HTMLImageElement {
  const img = document.createElement("img");
  img.src = projectAsset(path);
  img.alt = alt;
  img.draggable = false;
  img.className = className;
  return img;
}

export function rarityLabel(rarity: Rarity): string {
  return { blue: "蓝", purple: "紫", gold: "金", red: "红" }[rarity];
}

export function rarityClass(rarity: Rarity): string {
  return `rarity-${rarity}`;
}

export function toast(container: HTMLElement, message: string, tone: "info" | "success" | "warning" | "danger" = "info"): void {
  const node = el("div", `toast toast-${tone}`, message);
  container.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  window.setTimeout(() => {
    node.classList.remove("show");
    window.setTimeout(() => node.remove(), 300);
  }, 2200);
}
