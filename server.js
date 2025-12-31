import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

// ===== ENV =====
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("=== ENV CHECK ===");
console.log("SUPABASE_URL:", SUPABASE_URL ? "OK" : "MISSING");
console.log("SERVICE KEY:", SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MISSING");
console.log("=================");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Supabase non configuré !");
  process.exit(1);
}

// ===== SUPABASE =====
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ===== HEALTH CHECK =====
app.get("/status", (req, res) => {
  res.json({
    status: "OK",
    time: new Date().toISOString(),
  });
});

// ===== LOGIN MASTER (table FR) =====
// TABLE SUPABASE : "maîtres"
app.post("/login-master", async (req, res) => {
  const { username, password } = req.body;

  const { data, error } = await supabase
    .from('"maîtres"') // ⚠️ EXACT AVEC GUILLEMETS
    .select("*")
    .eq("username", username)
    .eq("password", password)
    .single();

  if (error || !data)
    return res.status(401).json({ success: false, message: "Identifiants incorrects" });

  res.json({
    success: true,
    user: {
      id: data.id,
      username: data.username
    }
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Backend running on port", PORT));