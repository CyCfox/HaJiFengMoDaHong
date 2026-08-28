import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let child: ChildProcess | null = null;
let tempDir = "";
let base = "";
const root = resolve(".");

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

describe("collection save API", () => {
  it("loads empty, lights, avoids duplicates and rejects unknown ids", async () => {
    let res = await fetch(`${base}/api/collections`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lit: [] });

    res = await fetch(`${base}/api/collections/maiden_pendant/light`, { method: "POST" });
    expect(res.status).toBe(200);
    const first = (await res.json()) as { ok: boolean; lit: string[] };
    expect(first.ok).toBe(true);
    expect(first.lit).toEqual(["maiden_pendant"]);

    res = await fetch(`${base}/api/collections/maiden_pendant/light`, { method: "POST" });
    expect(res.status).toBe(200);
    const duplicate = (await res.json()) as { lit: string[] };
    expect(duplicate.lit).toEqual(["maiden_pendant"]);

    res = await fetch(`${base}/api/collections/not-real/light`, { method: "POST" });
    expect(res.status).toBe(400);
  });
});
