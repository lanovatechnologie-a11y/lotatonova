const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth'); // Modification ici

// Récupérer la liste des agents
router.get('/agents', authMiddleware, async (req, res) => {
    try {
        const userRole = req.user.role;
        const userId = req.user.id;
        
        let query = supabase
            .from('agents')
            .select(`
                *,
                supervisors_level1(
                    id,
                    username,
                    full_name
                )
            `);
        
        // Filtrer selon le rôle
        if (userRole === 'supervisor1') {
            query = query.eq('supervisor1_id', userId);
        } else if (userRole === 'supervisor2') {
            // Récupérer les supervisors1 de ce supervisor2
            const { data: sup1s } = await supabase
                .from('supervisors_level1')
                .select('id')
                .eq('supervisor2_id', userId);
            
            if (sup1s && sup1s.length > 0) {
                const sup1Ids = sup1s.map(s => s.id);
                query = query.in('supervisor1_id', sup1Ids);
            }
        }
        
        const { data, error } = await query.order('created_at', { ascending: false });
        
        if (error) {
            console.error('Get agents error:', error);
            return res.status(400).json({ 
                error: 'Erreur de récupération',
                details: error.message 
            });
        }
        
        res.json({ 
            success: true,
            agents: data || [],
            count: data ? data.length : 0
        });
    } catch (error) {
        console.error('Get agents error:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            message: error.message 
        });
    }
});

// Récupérer le profil de l'utilisateur connecté
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;
        
        const tables = {
            master: 'master_users',
            subsystem: 'subsystem_admins',
            supervisor2: 'supervisors_level2',
            supervisor1: 'supervisors_level1',
            agent: 'agents'
        };
        
        const tableName = tables[userRole];
        if (!tableName) {
            return res.status(400).json({ error: 'Type d\'utilisateur invalide' });
        }
        
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        
        // Supprimer le hash du mot de passe
        delete data.password_hash;
        
        res.json({ 
            success: true,
            user: data 
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
