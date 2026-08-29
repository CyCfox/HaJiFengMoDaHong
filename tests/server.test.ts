import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let child: ChildProcess | null = null;
let tempDir = "";
let base = "";
let cookie = "";
const root = resolve(".");

function authFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  if (cookie) headers.set("cookie", cookie);
  return fetch(`${base}${path}`, { ...init, headers });
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "hajifeng-test-"));
  base = "http://127.0.0.1:3101";
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: "3101", HAJIFENG_DB_PATH: join(tempDir, "test.sqlite") },
    stdio: "pipe",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("server did not start");
});

afterAll(async () => {
  if (child && !child.killed) {
    const exit = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
    child.kill();
    await Promise.race([exit, new Promise((r) => setTimeout(r, 3000))]);
  }
  if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
});

describe("Cloudflare-compatible account and collection API", () => {
  it("exposes health", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("requires login for collection data", async () => {
    const res = await authFetch("/api/collections");
    expect(res.status).toBe(401);
  });

  it("registers a user, stores cookie and exposes profile", async () => {
    const res = await authFetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "玩家甲", password: "password123" }),
    });
    expect(res.status).toBe(201);
    const setCookie = res.headers.get("set-cookie") ?? "";
    cookie = setCookie.split(";")[0];
    expect(cookie).toContain("hajifeng_session=");

    const me = await authFetch("/api/auth/me");
    expect(me.status).toBe(200);
    const meJson = await me.json();
    expect(meJson.user.username).toBe("玩家甲");
    expect(meJson.profile).toEqual({ bestLevel: 0, redValue: 0 });
  });

  it("starts with empty cabinets", async () => {
    const res = await authFetch("/api/collections");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cabinets: [] });
  });


  it("persists a per-player save and resets run data on death", async () => {
    const empty = await authFetch("/api/save");
    expect((await empty.json()).save).toBeNull();

    const save = {
      level: 4,
      coins: 888888,
      clearedLevels: 3,
      ownedWeapons: [{
        id: "w-test", kind: "uzi",
        levels: { range: 2, fireRate: 1, damage: 1, pellets: 1 },
        purchasePrice: 350000, equipped: true, serial: 1,
      }],
      backpack: [{ uid: "bag-1", collectionId: "maiden_pendant" }],
      warehouse: [{ uid: "wh-1", collectionId: "gold_bar" }],
      buffs: [{ id: "hp20", stacks: 2 }],
      drawCountThisAffairs: 2,
    };
    const saved = await authFetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ save }),
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).save.level).toBe(4);

    const loaded = await authFetch("/api/save");
    const loadedJson = await loaded.json();
    expect(loadedJson.save).toMatchObject({
      level: 4, coins: 888888, clearedLevels: 3, drawCountThisAffairs: 2,
    });
    expect(loadedJson.save.ownedWeapons[0].kind).toBe("uzi");
    expect(loadedJson.save.backpack[0].collectionId).toBe("maiden_pendant");

    const death = await authFetch("/api/save/death", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: 4, clearedLevels: 3 }),
    });
    const deathJson = await death.json();
    expect(deathJson.save.level).toBe(4);
    expect(deathJson.save.clearedLevels).toBe(3);
    expect(deathJson.save.coins).toBe(0);
    expect(deathJson.save.ownedWeapons).toHaveLength(1);
    expect(deathJson.save.ownedWeapons[0].kind).toBe("g18");
    expect(deathJson.save.backpack).toEqual([]);
    expect(deathJson.save.warehouse).toEqual([]);
    expect(deathJson.save.buffs).toEqual([]);
  });


  it("rejects unknown collections", async () => {
    const res = await authFetch("/api/collections/not-real/light", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("lights a normal collection once at level 1", async () => {
    const res = await authFetch("/api/collections/maiden_pendant/light", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, collectionId: "maiden_pendant", level: 1, redValue: 0 });
  });

  it("does not allow a normal collection to be lit twice", async () => {
    const res = await authFetch("/api/collections/maiden_pendant/light", { method: "POST" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("already_lit");
  });

  it("upgrades red collections repeatedly and adds their value", async () => {
    const first = await authFetch("/api/collections/saied_watch/light", { method: "POST" });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ level: 1, redValue: 216831 });

    const second = await authFetch("/api/collections/saied_watch/light", { method: "POST" });
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.level).toBe(2);
    expect(secondJson.redValue).toBe(216831 * 2);
  });

  it("updates best progress monotonically", async () => {
    const first = await authFetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: 1 }),
    });
    expect((await first.json()).bestLevel).toBe(1);

    const lower = await authFetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: 0 }),
    });
    expect((await lower.json()).bestLevel).toBe(1);

    const higher = await authFetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: 7 }),
    });
    expect((await higher.json()).bestLevel).toBe(7);
  });

  it("returns both leaderboards", async () => {
    const levelRes = await authFetch("/api/leaderboard?type=level");
    const levelJson = await levelRes.json();
    expect(levelJson.type).toBe("level");
    expect(levelJson.entries[0]).toMatchObject({ username: "玩家甲", value: 7 });

    const redRes = await authFetch("/api/leaderboard?type=red");
    const redJson = await redRes.json();
    expect(redJson.type).toBe("red");
    expect(redJson.entries[0]).toMatchObject({ username: "玩家甲", value: 216831 * 2 });
  });

  it("supports logout and login", async () => {
    const out = await authFetch("/api/auth/logout", { method: "POST" });
    expect(out.status).toBe(200);
    cookie = "";
    expect((await authFetch("/api/auth/me")).status).toBe(401);

    const login = await authFetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "玩家甲", password: "password123" }),
    });
    expect(login.status).toBe(200);
    cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    expect((await authFetch("/api/auth/me")).status).toBe(200);
  });
});
