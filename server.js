const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// ENV
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ==============================
// TEST SERVER
// ==============================
app.get("/", (req, res) => {
  res.json({
    status: "BACKEND OK",
    supabase_url: SUPABASE_URL ? "detecté" : "ABSENT",
    time: new Date().toISOString(),
  });
});

// ==============================
// LOGIN MASTER
// TABLE : "maîtres"
// COLONNES : username , password
// ==============================
app.post("/login-master", async (req, res) => {
  const { username, password } = req.body;

  const { data, error } = await supabase
    .from('"maîtres"')     // <<< OBLIGATOIRE EXACT
    .select("*")
    .eq("username", username)
    .single();

  if (error || !data) {
    return res.status(401).json({ success: false, message: "Identifiants incorrects" });
  }

  const match = await bcrypt.compare(password, data.password);

  if (!match) {
    return res.status(401).json({ success: false, message: "Identifiants incorrects" });
  }

  res.json({
    success: true,
    message: "Connexion réussie",
    master: {
      id: data.id,
      username: data.username
    }
  });
});

// ==============================
// LOGIN ADMIN SOUS SYSTEME
// TABLE : "administrateurs_de_sous-système"
// ==============================
app.post("/login-admin", async (req, res) => {
  const { username, password } = req.body;

  const { data, error } = await supabase
    .from('"administrateurs_de_sous-système"')
    .select("*")
    .eq("username", username)
    .single();

  if (error || !data) return res.status(401).json({ success: false });

  const ok = await bcrypt.compare(password, data.password);
  if (!ok) return res.status(401).json({ success: false });

  res.json({ success: true, admin: data });
});

// ==============================
// LOGIN SUPERVISEUR NIVEAU 1
// TABLE : "superviseurs_niveau1"
// ==============================
app.post("/login-superviseur1", async (req, res) => {
  const { username, password } = req.body;

  const { data, error } = await supabase
    .from('"superviseurs_niveau1"')
    .select("*")
    .eq("username", username)
    .single();

  if (error || !data) return res.status(401).json({ success: false });

  const ok = await bcrypt.compare(password, data.password);
  if (!ok) return res.status(401).json({ success: false });

  res.json({ success: true, superviseur: data });
});

// ==============================
// LOGIN SUPERVISEUR NIVEAU 2
// TABLE : "superviseurs_niveau2"
// ==============================
app.post("/login-superviseur2", async (req, res) => {
  const { username, password } = req.body;

  const { data, error } = await supabase
    .from('"superviseurs_niveau2"')
    .select("*")
    .eq("username", username)
    .single();

  if (error || !data) return res.status(401).json({ success: false });

  const ok = await bcrypt.compare(password, data.password);
  if (!ok) return res.status(401).json({ success: false });

  res.json({ success: true, superviseur: data });
});

// ==============================
// LOGIN AGENT
// TABLE : "agents"
// ==============================
app.post("/login-agent", async (req, res) => {
  const { username, password } = req.body;

  const { data, error } = await supabase
    .from('"agents"')
    .select("*")
    .eq("username", username)
    .single();

  if (error || !data) return res.status(401).json({ success: false });

  const ok = await bcrypt.compare(password, data.password);
  if (!ok) return res.status(401).json({ success: false });

  res.json({ success: true, agent: data });
});


// ==============================
// RUN SERVER
// ==============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 Backend Nova Lotto RUNNING on port " + PORT);
});