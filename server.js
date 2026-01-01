import express from "express";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

// === __dirname fix ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===== ENV =====
const SUPABASE_URL = process.env.SUPABASE_URL;

// accepte les DEUX noms pour éviter erreurs
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

console.log("=== CHECK ENV ===");
console.log("SUPABASE_URL :", SUPABASE_URL ? "OK" : "MISSING");
console.log("SERVICE KEY :", SERVICE_KEY ? "OK" : "MISSING");
console.log("================");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.log("❌ Supabase non configuré !");
  process.exit(1);
}

// ===== SUPABASE =====
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ===== SERVE HTML ROOT =====
app.use(express.static(__dirname));

// ===== HEALTH CHECK =====
app.get("/status", (req, res) => {
  res.json({
    status: "OK",
    supabase: "Configured",
    time: new Date()
  });
});

// ===== MASTER LOGIN =====
app.post("/api/master-login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ ok: false, message: "Champs manquants" });

  const { data, error } = await supabase
    .from("masters")
    .select("*")
    .eq("nom_d'utilisateur", username)
    .eq("mot_de_passe", password)
    .single();

  if (error || !data)
    return res.status(401).json({
      ok: false,
      message: "Identifiants incorrects"
    });

  res.json({
    ok: true,
    message: "Connexion réussie",
    user: data
  });
});

// ===== SERVE index.html FOR EVERYTHING ELSE =====
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===== START =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Nova Lotto running on port", PORT));