import express from "express";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest } from "./core/api.mjs";
import { SqliteAdapter } from "./db/sqlite.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const defaultDb = join(__dirname, "data", "hajifeng.sqlite");
const dbPath = process.env.HAJIFENG_DB_PATH || defaultDb;
const db = new SqliteAdapter(dbPath);

const app = express();
app.use(express.json({ limit: "256kb" }));

app.use("/api", async (req, res, next) => {
  try {
    const protocol = req.protocol || "http";
    const host = req.headers.host || "localhost";
    const url = new URL(req.originalUrl, `${protocol}://${host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
    }
    let body;
    if (req.body !== undefined) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }
    const request = new Request(url, { method: req.method, headers, body });
    const response = await handleApiRequest(request, db);
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === "set-cookie") {
        for (const cookie of response.headers.getSetCookie()) res.append("Set-Cookie", cookie);
      } else {
        res.setHeader(key, value);
      }
    }
    const text = await response.text();
    if (text) res.send(text);
    else res.end();
  } catch (error) {
    console.error("API error", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

const distDir = join(root, "dist");
app.use(express.static(distDir));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  const index = join(distDir, "index.html");
  if (existsSync(index)) res.sendFile(index);
  else res.status(404).json({ error: "Frontend not built. Run npx vite build." });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`HaJiFeng local API listening on http://localhost:${port}`);
  console.log(`SQLite: ${dbPath}`);
});
