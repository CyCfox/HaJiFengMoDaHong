import { createStarterSave } from "../core/defaults.mjs";

export class D1Adapter {
  constructor(db) {
    this.db = db;
  }

  async findUserByUsername(username) {
    return await this.db.prepare(
      "SELECT id, username, pass_hash, created_at FROM users WHERE username = ?"
    ).bind(username).first() ?? null;
  }

  async createUser(userId, username, passHash) {
    const now = Date.now();
    await this.db.batch([
      this.db.prepare(
        "INSERT INTO users (id, username, pass_hash, created_at) VALUES (?, ?, ?, ?)"
      ).bind(userId, username, passHash, now),
      this.db.prepare(
        "INSERT INTO player_profiles (user_id, best_level, red_value, updated_at) VALUES (?, 0, 0, ?)"
      ).bind(userId, now),
    ]);
  }

  async createSession(tokenHash, userId, expiresAt) {
    await this.db.prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
    ).bind(tokenHash, userId, expiresAt, Date.now()).run();
  }

  async findSessionUser(tokenHash) {
    return await this.db.prepare(
      `SELECT u.id, u.username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    ).bind(tokenHash, Date.now()).first() ?? null;
  }

  async deleteSession(tokenHash) {
    await this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }

  async getProfile(userId) {
    return await this.db.prepare(
      "SELECT best_level, red_value, updated_at FROM player_profiles WHERE user_id = ?"
    ).bind(userId).first() ?? { best_level: 0, red_value: 0, updated_at: 0 };
  }

  async updateBestLevel(userId, level) {
    const now = Date.now();
    await this.db.prepare(
      `INSERT INTO player_profiles (user_id, best_level, red_value, updated_at)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         best_level = MAX(player_profiles.best_level, excluded.best_level),
         updated_at = excluded.updated_at`
    ).bind(userId, level, now).run();
    return this.getProfile(userId);
  }

  async getCabinetLevels(userId) {
    const result = await this.db.prepare(
      "SELECT collection_id, level, total_value FROM collection_cabinets WHERE user_id = ?"
    ).bind(userId).all();
    return result.results.map((row) => ({
      collectionId: row.collection_id,
      level: Number(row.level),
      value: Number(row.total_value),
    }));
  }

  async submitCollection(userId, collectionId, value, isRed) {
    const now = Date.now();
    const current = await this.db.prepare(
      "SELECT level FROM collection_cabinets WHERE user_id = ? AND collection_id = ?"
    ).bind(userId, collectionId).first();
    const currentLevel = Number(current?.level ?? 0);

    const statements = [];
    if (isRed || currentLevel === 0) {
      statements.push(this.db.prepare(
        `INSERT INTO collection_cabinets (user_id, collection_id, level, total_value, updated_at)
         VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(user_id, collection_id) DO UPDATE SET
           level = level + 1,
           total_value = total_value + excluded.total_value,
           updated_at = excluded.updated_at`
      ).bind(userId, collectionId, value, now));
    }

    if (isRed) {
      statements.push(
        this.db.prepare(
          "UPDATE player_profiles SET red_value = red_value + ?, updated_at = ? WHERE user_id = ?"
        ).bind(value, now, userId),
        this.db.prepare(
          "INSERT INTO cabinet_submissions (user_id, collection_id, value, is_red, submitted_at) VALUES (?, ?, ?, 1, ?)"
        ).bind(userId, collectionId, value, now),
      );
    }

    if (statements.length) await this.db.batch(statements);

    const all = await this.getCabinetLevels(userId);
    const profile = await this.getProfile(userId);
    const target = all.find((item) => item.collectionId === collectionId);
    return { level: target?.level ?? 0, redValue: profile.red_value };
  }

  async getSave(userId) {
    const row = await this.db.prepare("SELECT data FROM player_saves WHERE user_id = ?").bind(userId).first();
    return row ? JSON.parse(row.data) : null;
  }

  async saveRun(userId, save) {
    const now = Date.now();
    await this.db.prepare(
      `INSERT INTO player_saves (user_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).bind(userId, JSON.stringify(save), now).run();
    return save;
  }

  async resetRunAfterDeath(userId, level, clearedLevels) {
    return this.saveRun(userId, createStarterSave(userId, level, clearedLevels));
  }

  async getLeaderboard(type) {
    const order = type === "level" ? "best_level" : "red_value";
    const result = await this.db.prepare(
      `SELECT u.username, p.${order} AS value
       FROM player_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE p.${order} > 0
       ORDER BY p.${order} DESC, p.updated_at ASC
       LIMIT 20`
    ).all();
    return result.results.map((row, index) => ({
      rank: index + 1,
      username: row.username,
      value: Number(row.value),
    }));
  }
}
