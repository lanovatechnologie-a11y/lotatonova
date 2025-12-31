import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import supabase from "./supabase.js";

const router = express.Router();

async function tryLogin(table, username, password) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("username", username)
    .single();

  if (error || !data) return null;

  const match = await bcrypt.compare(password, data.password_hash);
  if (!match) return null;

  await supabase
    .from(table)
    .update({ last_login: new Date() })
    .eq("id", data.id);

  return {
    id: data.id,
    username: data.username,
    role: table
  };
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ message: "Identifiants requis" });

  const roles = [
    "master_users",
    "subsystem_admins",
    "supervisors_level2",
    "supervisors_level1",
    "agents"
  ];

  for (let table of roles) {
    const user = await tryLogin(table, username, password);
    if (user) {
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" });

      return res.json({
        message: "Connexion réussie",
        user,
        token
      });
    }
  }

  return res.status(401).json({ message: "Identifiants invalides" });
});

export default router;