import { getCollectionMeta } from "../../shared/collection-meta.mjs";

const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 100_000;
const COOKIE_NAME = "hajifeng_session";



function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function badRequest(message) {
  return json({ ok: false, error: message }, 400);
}

function unauthorized(message = "请先登录") {
  return json({ ok: false, error: message }, 401);
}

function encodeBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PASSWORD_ITERATIONS}$${encodeBase64(salt)}$${encodeBase64(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  const [, iterationsText, saltText, hashText] = stored.split("$");
  const iterations = Number(iterationsText);
  const salt = decodeBase64(saltText);
  const expected = decodeBase64(hashText);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  ));
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

function getCookie(request, name) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function sessionCookie(request, value, maxAge) {
  const secure = (request.url.startsWith("https://") ? "Secure; " : "");
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; ${secure}Max-Age=${maxAge}`;
}

function clearSessionCookie(request) {
  return sessionCookie(request, "", 0);
}

function sanitizeSave(raw) {
  const value = raw ?? {};
  const safeNumber = (input, fallback, min) => {
    const n = Math.floor(Number(input));
    return Number.isFinite(n) && n >= min ? n : fallback;
  };
  return {
    level: safeNumber(value.level, 1, 1),
    coins: safeNumber(value.coins, 0, 0),
    clearedLevels: safeNumber(value.clearedLevels, 0, 0),
    ownedWeapons: Array.isArray(value.ownedWeapons) ? value.ownedWeapons : [],
    backpack: Array.isArray(value.backpack) ? value.backpack : [],
    warehouse: Array.isArray(value.warehouse) ? value.warehouse : [],
    buffs: Array.isArray(value.buffs) ? value.buffs : [],
    drawCountThisAffairs: safeNumber(value.drawCountThisAffairs, 0, 0),
    unlockedAgents: Array.isArray(value.unlockedAgents) ? value.unlockedAgents.filter((id) => typeof id === "string") : [],
    selectedAgents: Array.isArray(value.selectedAgents) ? value.selectedAgents.filter((id) => typeof id === "string") : [],
    unlockedAgentSkills: Array.isArray(value.unlockedAgentSkills) ? value.unlockedAgentSkills.filter((id) => typeof id === "string") : [],
    agentUpgrades: value.agentUpgrades && typeof value.agentUpgrades === "object" ? value.agentUpgrades : {},
    agentLevels: value.agentLevels && typeof value.agentLevels === "object" ? value.agentLevels : {},
  };
}

function validUsername(username) {
  return /^[A-Za-z0-9_\u4e00-\u9fa5]{2,24}$/.test(username);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function publicUser(user) {
  return { id: user.id, username: user.username };
}

async function requireUser(request, db) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const user = await db.findSessionUser(await sha256Hex(token));
  if (!user) return null;
  return { ...user, token };
}

async function authResult(request, db, user, status = 200) {
  const profile = await db.getProfile(user.id);
  const response = json({
    ok: true,
    user: publicUser(user),
    profile: { bestLevel: profile.best_level, redValue: profile.red_value },
  }, status);
  return response;
}

async function register(request, db) {
  const body = await readJson(request);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  if (!validUsername(username)) return badRequest("用户名需为2-24位字母、数字、下划线或中文");
  if (password.length < 6 || password.length > 128) return badRequest("密码长度需为6-128位");
  if (await db.findUserByUsername(username)) return json({ ok: false, error: "用户名已存在" }, 409);

  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  await db.createUser(id, username, hash);

  const token = randomToken();
  await db.createSession(await sha256Hex(token), id, Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const response = await authResult(request, db, { id, username, token }, 201);
  response.headers.set("Set-Cookie", sessionCookie(request, token, SESSION_DAYS * 24 * 60 * 60));
  return response;
}

async function login(request, db) {
  const body = await readJson(request);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const user = await db.findUserByUsername(username);
  if (!user || !(await verifyPassword(password, user.pass_hash))) return unauthorized("用户名或密码错误");

  const token = randomToken();
  await db.createSession(await sha256Hex(token), user.id, Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const response = await authResult(request, db, user);
  response.headers.set("Set-Cookie", sessionCookie(request, token, SESSION_DAYS * 24 * 60 * 60));
  return response;
}

async function logout(request, db) {
  const token = getCookie(request, COOKIE_NAME);
  if (token) await db.deleteSession(await sha256Hex(token));
  const response = json({ ok: true });
  response.headers.set("Set-Cookie", clearSessionCookie(request));
  return response;
}

export async function handleApiRequest(request, db) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  try {
    if (method === "GET" && path === "/api/health") {
      return json({ ok: true, runtime: "cloudflare-pages-functions" });
    }

    if (method === "POST" && path === "/api/auth/register") return register(request, db);
    if (method === "POST" && path === "/api/auth/login") return login(request, db);
    if (method === "POST" && path === "/api/auth/logout") return logout(request, db);

    if (method === "GET" && path === "/api/auth/me") {
      const user = await requireUser(request, db);
      if (!user) return json({ ok: true, user: null, profile: null });
      return authResult(request, db, user);
    }

    if (method === "GET" && path === "/api/collections") {
      const user = await requireUser(request, db);
      if (!user) return unauthorized();
      const cabinets = await db.getCabinetLevels(user.id);
      return json({ ok: true, cabinets });
    }

    const lightMatch = path.match(/^\/api\/collections\/([^/]+)\/light$/);
    if (method === "POST" && lightMatch) {
      const user = await requireUser(request, db);
      if (!user) return unauthorized();
      const collectionId = decodeURIComponent(lightMatch[1]);
      const meta = getCollectionMeta(collectionId);
      if (!meta) return badRequest("unknown_collection");
      const cabinets = await db.getCabinetLevels(user.id);
      const existing = cabinets.find((item) => item.collectionId === collectionId);
      if (existing && existing.level > 0 && meta.rarity !== "red") return badRequest("already_lit");
      const result = await db.submitCollection(user.id, collectionId, meta.price, meta.rarity === "red");
      return json({ ok: true, collectionId, level: result.level, redValue: result.redValue });
    }

    if (method === "POST" && path === "/api/progress") {
      const user = await requireUser(request, db);
      if (!user) return unauthorized();
      const body = await readJson(request);
      const level = Number(body?.level);
      if (!Number.isInteger(level) || level < 0) return badRequest("invalid_level");
      const profile = await db.updateBestLevel(user.id, level);
      return json({ ok: true, bestLevel: profile.best_level });
    }

    if (method === "GET" && path === "/api/save") {
      const user = await requireUser(request, db);
      if (!user) return unauthorized();
      return json({ ok: true, save: await db.getSave(user.id) });
    }

    if (method === "POST" && path === "/api/save") {
      const user = await requireUser(request, db);
      if (!user) return unauthorized();
      const body = await readJson(request);
      const save = await db.saveRun(user.id, sanitizeSave(body?.save));
      return json({ ok: true, save });
    }

    if (method === "POST" && path === "/api/save/death") {
      const user = await requireUser(request, db);
      if (!user) return unauthorized();
      const body = await readJson(request);
      const level = Number(body?.level);
      const clearedLevels = Number(body?.clearedLevels);
      const save = await db.resetRunAfterDeath(
        user.id,
        Number.isFinite(level) ? level : 1,
        Number.isFinite(clearedLevels) ? clearedLevels : 0,
      );
      return json({ ok: true, save });
    }

    if (method === "GET" && path === "/api/leaderboard") {
      const type = url.searchParams.get("type") === "red" ? "red" : "level";
      return json({ ok: true, type, entries: await db.getLeaderboard(type) });
    }

    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    console.error("API error", error);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}
