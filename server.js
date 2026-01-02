// ================== IMPORTS ==================
import express from "express";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";

// ================== FIX __dirname ==================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================== APP ==================
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ================== ENV ==================
const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = "nova_lotto";

if (!MONGO_URL) {
  console.error("❌ MONGO_URL manquant !");
  process.exit(1);
}

console.log("🔍 Vérification ENV:");
console.log("MONGO_URL :", MONGO_URL ? "OK" : "MISSING");
console.log("================================");

// ================== MONGO CLIENT ==================
let db;

async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URL, {
      serverApi: {
        version: "1",
        strict: true,
        deprecationErrors: true,
      },
    });

    await client.connect();
    db = client.db(DB_NAME);

    console.log("✅ MongoDB CONNECTÉ avec succès !");
  } catch (err) {
    console.error("❌ ERREUR MongoDB :", err);
  }
}

await connectDB();

// ================== STATIC FRONTEND ==================
app.use(express.static(__dirname));

// ================== HEALTH CHECK ==================
app.get("/status", (req, res) => {
  res.json({
    status: "OK",
    mongo: db ? "Connected" : "Disconnected",
    time: new Date(),
  });
});

// ================== MASTER LOGIN ==================
app.post("/api/master-login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({
        ok: false,
        message: "Champs manquants",
      });

    const user = await db.collection("masters").findOne({
      username,
      password,
    });

    if (!user)
      return res.status(401).json({
        ok: false,
        message: "Identifiants incorrects",
      });

    res.json({
      ok: true,
      message: "Connexion réussie",
      user,
    });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
});

// ================== DEFAULT ROUTE ==================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 10000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Backend Nova Lotto sur port", PORT);
});