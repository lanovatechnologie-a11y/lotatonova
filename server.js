import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { MongoClient } from "mongodb";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===== MONGO DB CONFIG =====
const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
  console.log("❌ MONGO_URL manquant !");
  process.exit(1);
}

const client = new MongoClient(MONGO_URL);
let db;

// ===== CONNECT DB =====
async function connectDB() {
  try {
    await client.connect();
    db = client.db("nova"); // database name
    console.log("✅ MongoDB connecté avec succès !");
  } catch (err) {
    console.error("❌ ERREUR MongoDB :", err);
    process.exit(1);
  }
}

connectDB();

// ===== HEALTH CHECK =====
app.get("/status", (req, res) => {
  res.json({
    status: "OK",
    database: db ? "Connected" : "Disconnected",
    time: new Date()
  });
});

// ===== MASTER LOGIN =====
app.post("/api/master-login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ ok: false, message: "Champs manquants" });

  const user = await db.collection("masters").findOne({
    username,
    password
  });

  if (!user)
    return res.status(401).json({ ok: false, message: "Identifiants invalides" });

  res.json({
    ok: true,
    message: "Connexion réussie",
    user
  });
});

// ===== SUBSYSTEM ADMIN LOGIN =====
app.post("/api/subsystem-admin-login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ ok: false, message: "Champs manquants" });

  const user = await db.collection("subsystem_admins").findOne({
    username,
    password
  });

  if (!user)
    return res.status(401).json({ ok: false, message: "Identifiants invalides" });

  res.json({
    ok: true,
    message: "Connexion réussie",
    user
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Backend Nova Lotto sur port", PORT));