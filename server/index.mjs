import express from "express";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const defaultDb = join(__dirname, "data", "hajifeng.sqlite");
const dbPath = process.env.HAJIFENG_DB_PATH || defaultDb;
const knownIds = JSON.parse(readFileSync(join(root, "shared", "collection-ids.json"), "utf8"));

mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS lit_collections (
    id TEXT PRIMARY KEY,
    lit_at INTEGER NOT NULL
  );
`);

const getLit = () => db.prepare("SELECT id FROM lit_collections ORDER BY lit_at ASC").all().map((row) => row.id);
const insertLit = db.prepare("INSERT OR IGNORE INTO lit_collections (id, lit_at) VALUES (?, ?)");

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, dbPath });
});

app.get("/api/collections", (_req, res) => {
  res.json({ lit: getLit() });
});

app.post("/api/collections/:id/light", (req, res) => {
  const id = req.params.id;
  if (!knownIds.includes(id)) {
    return res.status(400).json({ ok: false, error: "unknown_collection" });
  }
  insertLit.run(id, Date.now());
  res.json({ ok: true, lit: getLit() });
});

const distDir = join(root, "dist");
app.use(express.static(distDir));

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  const index = join(distDir, "index.html");
  if (existsSync(index)) {
    res.sendFile(index);
  } else {
    res.status(404).json({ error: "Frontend not built. Run npx vite build." });
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`HaJiFeng server listening on http://localhost:${port}`);
  console.log(`SQLite: ${dbPath}`);
});
