const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ================= ENV ==================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log("❌ Supabase non configuré");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =============== STATIC FILES ============
app.use(express.static(path.join(__dirname)));

// =============== HEALTH ==================
app.get("/status", (req, res) => {
  res.json({
    status: "OK",
    supabase: "Configured",
    time: new Date()
  });
});

// =============== LOGIN MASTER ============
app.post("/api/master-login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ ok: false, message: "Champs manquants" });

  const { data, error } = await supabase
    .from("masters")
    .select("*")
    .eq("username", username)
    .eq("password", password)
    .single();

  if (error || !data)
    return res.status(401).json({ ok: false, message: "Identifiants incorrects" });

  res.json({ ok: true, message: "Connexion réussie", user: data });
});

// ========= DEFAULT ROUTE =========
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ========= START SERVER ===========
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 Nova Lotto running on port", PORT);
});