import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Routes
import authRoutes from "./auth.js";
import userRoutes from "./users.js";

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    supabase: process.env.SUPABASE_URL ? "Configured" : "Missing"
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Nova Lotto Backend Running on Port", PORT);
});