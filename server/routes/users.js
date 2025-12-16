const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');

// Récupérer la liste des agents
router.get('/agents', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('agents')
            .select('*');
        
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        
        res.json({ agents: data });
    } catch (error) {
        console.error('Get agents error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
