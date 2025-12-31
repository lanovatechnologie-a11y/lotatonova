import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

// Obligatoire pour ESModule
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================
// CONFIG
// =============================
const PORT = process.env.PORT || 10000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || "NOVA_SECRET";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ ERREUR : Supabase n'est pas configuré !");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =============================
// MIDDLEWARES
// =============================
app.use(cors());
app.use(express.json());

// =============================
// SERVIR TES HTML
// =============================

// Sert tous les fichiers de la racine
app.use(express.static(__dirname));

// Route par défaut -> index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// =============================
// HEALTH CHECK
// =============================
app.get("/api/health", async (req, res) => {
  try {
    const { data, error } = await supabase.from("master_users").select("id").limit(1);

    if (error) throw error;

    res.json({
      status: "OK",
      supabase: "CONNECTED",
      message: "Nova Lotto backend running"
    });

  } catch (e) {
    res.status(500).json({
      status: "ERROR",
      supabase: "DISCONNECTED",
      message: e.message
    });
  }
});

// =============================
// AUTH LOGIN (MASTER, SUB, AGENTS etc ensuite tu complètes)
// =============================
app.post("/api/auth/login", async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role)
    return res.status(400).json({ message: "Champs manquants" });

  let table = null;

  switch (role) {
    case "master":
      table = "master_users";
      break;
    case "subsystem":
      table = "subsystem_admins";
      break;
    case "supervisor1":
      table = "supervisors_level1";
      break;
    case "supervisor2":
      table = "supervisors_level2";
      break;
    case "agent":
      table = "agents";
      break;
    default:
      return res.status(400).json({ message: "Rôle invalide" });
  }

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("username", username)
    .single();

  if (error || !data)
    return res.status(401).json({ message: "Utilisateur introuvable" });

  // ⚠️ TEMPORAIRE : mot de passe en clair (car tu as demandé simple)
  if (data.password !== password)
    return res.status(401).json({ message: "Mot de passe incorrect" });

  const token = jwt.sign(
    { id: data.id, role },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  res.json({ message: "success", token, user: data });
});

// =============================
// LANCEMENT SERVEUR
// =============================
app.listen(PORT, () => {
  console.log(`🚀 Nova Lotto backend running on port ${PORT}`);
});