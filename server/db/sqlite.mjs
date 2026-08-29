import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStarterSave } from "../core/defaults.mjs";

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "schema.sql");
const migrations = readFileSync(schemaPath, "utf8");

export class SqliteAdapter {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(migrations);
  }

  async findUserByUsername(username) {
    return this.db.prepare(
      "SELECT id, username, pass_hash, created_at FROM users WHERE username = ?"
    ).get(username) ?? null;
  }

  async createUser(userId, username, passHash) {
    const now = Date.now();
    this.db.exec("BEGIN");
    try {
      this.db.prepare(
        "INSERT INTO users (id, username, pass_hash, created_at) VALUES (?, ?, ?, ?)"
      ).run(userId, username, passHash, now);
      this.db.prepare(
        "INSERT INTO player_profiles (user_id, best_level, red_value, updated_at) VALUES (?, 0, 0, ?)"
      ).run(userId, now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async createSession(tokenHash, userId, expiresAt) {
    this.db.prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
    ).run(tokenHash, userId, expiresAt, Date.now());
  }

  async findSessionUser(tokenHash) {
    return this.db.prepare(
      `SELECT u.id, u.username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    ).get(tokenHash, Date.now()) ?? null;
  }

  async deleteSession(tokenHash) {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  async getProfile(userId) {
    return this.db.prepare(
      "SELECT best_level, red_value, updated_at FROM player_profiles WHERE user_id = ?"
    ).get(userId) ?? { best_level: 0, red_value: 0, updated_at: 0 };
  }

  async updateBestLevel(userId, level) {
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO player_profiles (user_id, best_level, red_value, updated_at)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         best_level = MAX(player_profiles.best_level, excluded.best_level),
         updated_at = excluded.updated_at`
    ).run(userId, level, now);
    return this.getProfile(userId);
  }

  async getCabinetLevels(userId) {
    const rows = this.db.prepare(
      "SELECT collection_id, level, total_value FROM collection_cabinets WHERE user_id = ?"
    ).all(userId);
    return rows.map((row) => ({
      collectionId: row.collection_id,
      level: row.level,
      value: row.total_value,
    }));
  }

  async submitCollection(userId, collectionId, value, isRed) {
    const now = Date.now();
    const current = this.db.prepare(
      "SELECT level FROM collection_cabinets WHERE user_id = ? AND collection_id = ?"
    ).get(userId, collectionId);

    this.db.exec("BEGIN");
    try {
      const currentLevel = current?.level ?? 0;
      if (isRed || currentLevel === 0) {
        this.db.prepare(
          `INSERT INTO collection_cabinets (user_id, collection_id, level, total_value, updated_at)
           VALUES (?, ?, 1, ?, ?)
           ON CONFLICT(user_id, collection_id) DO UPDATE SET
             level = level + 1,
             total_value = total_value + excluded.total_value,
             updated_at = excluded.updated_at`
        ).run(userId, collectionId, value, now);
      }

      if (isRed) {
        this.db.prepare(
          "UPDATE player_profiles SET red_value = red_value + ?, updated_at = ? WHERE user_id = ?"
        ).run(value, now, userId);
        this.db.prepare(
          "INSERT INTO cabinet_submissions (user_id, collection_id, value, is_red, submitted_at) VALUES (?, ?, ?, 1, ?)"
        ).run(userId, collectionId, value, now);
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    const level = await this.getCabinetLevels(userId);
    const profile = await this.getProfile(userId);
    const target = level.find((item) => item.collectionId === collectionId);
    return { level: target?.level ?? 0, redValue: profile.red_value };
  }

  async getSave(userId) {
    const row = this.db.prepare("SELECT data FROM player_saves WHERE user_id = ?").get(userId);
    return row ? JSON.parse(row.data) : null;
  }

  async saveRun(userId, save) {
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO player_saves (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(userId, JSON.stringify(save), now);
    return save;
  }

  async resetRunAfterDeath(userId, level, clearedLevels) {
    return this.saveRun(userId, createStarterSave(userId, level, clearedLevels));
  }

  async getLeaderboard(type) {
    const order = type === "level" ? "best_level" : "red_value";
    const rows = this.db.prepare(
      `SELECT u.username, p.${order} AS value
       FROM player_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE p.${order} > 0
       ORDER BY p.${order} DESC, p.updated_at ASC
       LIMIT 20`
    ).all();
    return rows.map((row, index) => ({
      rank: index + 1,
      username: row.username,
      value: Number(row.value),
    }));
  }
}
