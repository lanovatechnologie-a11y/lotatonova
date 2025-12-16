const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Login pour tous les types d'utilisateurs
router.post('/login', async (req, res) => {
    try {
        const { username, password, userType } = req.body;
        
        // Ton code existant...
        // (reste exactement le même que tu as déjà)
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
