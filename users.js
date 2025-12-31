import express from "express";
import auth from "./auth_middleware.js";

const router = express.Router();

router.get("/profile", auth, async (req, res) => {
  res.json({
    message: "Profil récupéré",
    user: req.user
  });
});

export default router;