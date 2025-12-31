// ================================
// Nova Lotto Backend + Frontend
// ================================
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

// ================================
// PATH CONFIG
// ================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================
// ENV CHECK
// ================================
console.log("=== CHECK ENV VARIABLES ===");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "OK" : "MISSING");
console.log("SERVICE KEY:", process.env.SUPABASE_SERVICE_KEY ? "OK" : "MISSING");
console.log("ANON KEY:", process.env.SUPABASE_ANON_KEY ? "OK" : "MISSING");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "MISSING");
console.log("===========================");

// ================================
// STOP IF NOT CONFIGURED
// ================================
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error("❌ ERREUR : Supabase n'est pas configuré !");
  process.exit(1);
}

// ================================
// SUPABASE CLIENT
// ================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ================================
// JWT SECRET
// ================================
const JWT_SECRET = process.env.JWT_SECRET || "nova_lotto_dev_secret";

// ================================
// HEALTH CHECK
// ================================
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    supabase: "Configured",
    time: new Date().toISOString(),
  });
});

// ================================
// LOGIN ROUTE
// ================================
app.post("/api/login", async (req, res) => {
  try {
    const { username, password, role, level } = req.body;

    if (!username || !password) {
      return res.json({ success: false, error: "Champs requis manquants" });
    }

    let table = null;

    if (role === "master") table = "master_users";
    else if (role === "subsystem_admin") table = "subsystem_admins";
    else if (level === "1") table = "supervisors_level1";
    else if (level === "2") table = "supervisors_level2";
    else
      return res.json({
        success: false,
        error: "Role ou niveau invalide",
      });

    console.log("🔍 Tentative login:", { username, table });

    const { data: user, error } = await supabase
      .from(table)
      .select("*")
      .eq("username", username)
      .single();

    if (error || !user) {
      console.log("❌ Utilisateur non trouvé");
      return res.json({ success: false, error: "Identifiants incorrects" });
    }

    if (user.password_hash !== password) {
      console.log("❌ Mauvais mot de passe");
      return res.json({ success: false, error: "Identifiants incorrects" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: role || level,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("✅ Connexion réussie:", username);

    res.json({
      success: true,
      token,
      user,
    });
  } catch (err) {
    console.error("🔥 ERREUR LOGIN:", err);
    res.json({ success: false, error: "Erreur serveur" });
  }
});

// ================================
// FRONTEND STATIC FILES
// ================================
app.use(express.static(__dirname));

// PAGE D’ACCUEIL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ================================
// START SERVER
// ================================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("🚀 Serveur Nova Lotto fonctionnant sur le port", PORT);
});