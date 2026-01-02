import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

/* =======================
   MIDDLEWARES
======================= */
app.use(cors());
app.use(express.json());

/* =======================
   MONGODB
======================= */
if (!process.env.MONGO_URL) {
  console.error("❌ MONGO_URL est manquant !");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB CONNECTÉ avec succès !"))
  .catch((err) => {
    console.error("❌ ERREUR MongoDB :", err.message);
    process.exit(1);
  });

/* =======================
   API HEALTH (UTILISÉ PAR INDEX.HTML)
======================= */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

/* =======================
   AUTH LOGIN (UTILISÉ PAR INDEX.HTML)
======================= */
app.post("/api/auth/login", async (req, res) => {
  const { username, password, level } = req.body;

  // ⚠️ TEMPORAIRE (POUR TEST)
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: "Identifiants requis",
    });
  }

  return res.json({
    success: true,
    token: "FAKE_JWT_TOKEN",
    user: {
      username,
      role: level ? `supervisor-${level}` : "user",
    },
  });
});

/* =======================
   STATIC FILES
======================= */
const __dirname = path.resolve();
app.use(express.static(__dirname));

/* =======================
   SPA FALLBACK
======================= */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =======================
   START SERVER
======================= */
app.listen(PORT, () => {
  console.log(`🚀 Backend Nova Lotto sur port ${PORT}`);
});