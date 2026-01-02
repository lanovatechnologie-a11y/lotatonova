import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// ------------------ DATABASE ------------------
const mongoUri = process.env.URL_MONGO;

mongoose.connect(mongoUri)
  .then(() => console.log("✅ MongoDB CONNECTÉ avec succès !"))
  .catch(err => console.error("❌ ERREUR MongoDB :", err));

// ------------------ API ROUTES ------------------
app.get("/api/status", (req, res) => {
  res.json({
    status: "OK",
    mongo: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
  });
});

// Exemple login Master (garde le tien si tu l’as déjà)
app.post("/api/master/login", async (req, res) => {
  res.json({ ok: true });
});

// ------------------ STATIC FILES ------------------
const __dirname = path.resolve();
app.use(express.static(__dirname));

// ------------------ CATCH ALL (VERY LAST) ------------------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => {
  console.log(`🚀 Backend Nova Lotto sur port ${PORT}`);
});