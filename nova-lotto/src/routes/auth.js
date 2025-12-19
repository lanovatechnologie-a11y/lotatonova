const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Tables selon le type d'utilisateur
const userTables = {
    master: 'master_users',
    subsystem: 'subsystem_admins',
    supervisor2: 'supervisors_level2',
    supervisor1: 'supervisors_level1',
    agent: 'agents'
};

// Login pour tous les types d'utilisateurs
router.post('/login', async (req, res) => {
    try {
        const { username, password, userType } = req.body;
        
        // Validation des données
        if (!username || !password || !userType) {
            return res.status(400).json({ 
                error: 'Données manquantes',
                message: 'Username, password et userType sont requis' 
            });
        }
        
        // Vérifier que le type d'utilisateur est valide
        const tableName = userTables[userType];
        if (!tableName) {
            return res.status(400).json({ 
                error: 'Type d\'utilisateur invalide',
                message: `Type autorisé: ${Object.keys(userTables).join(', ')}` 
            });
        }
        
        // Rechercher l'utilisateur dans la bonne table
        const { data: users, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('username', username)
            .eq('is_active', true);
        
        if (error) {
            console.error('Supabase query error:', error);
            return res.status(500).json({ 
                error: 'Erreur de base de données',
                details: error.message 
            });
        }
        
        if (!users || users.length === 0) {
            return res.status(401).json({ 
                error: 'Identifiants incorrects',
                message: 'Username ou mot de passe invalide' 
            });
        }
        
        const user = users[0];
        
        // Vérifier le mot de passe
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Identifiants incorrects',
                message: 'Username ou mot de passe invalide' 
            });
        }
        
        // Mettre à jour last_login
        await supabase
            .from(tableName)
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);
        
        // Enregistrer l'activité
        await supabase
            .from('activities')
            .insert({
                user_id: user.id,
                action: 'login',
                details: `${userType} login successful`,
                ip_address: req.ip
            });
        
        // Créer le token JWT
        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not configured');
            return res.status(500).json({ error: 'Configuration serveur incorrecte' });
        }
        
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username,
                role: userType,
                subsystem_id: user.subsystem_id || null,
                supervisor2_id: user.supervisor2_id || null,
                supervisor1_id: user.supervisor1_id || null
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        // Préparer les données utilisateur (sans le hash du mot de passe)
        const userData = {
            id: user.id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            role: userType,
            subsystem_id: user.subsystem_id,
            supervisor2_id: user.supervisor2_id,
            supervisor1_id: user.supervisor1_id
        };
        
        res.json({ 
            success: true,
            token,
            user: userData,
            message: 'Connexion réussie'
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            message: error.message 
        });
    }
});

// Route de vérification du token
router.get('/verify', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({ valid: true, user: decoded });
    } catch (error) {
        res.status(403).json({ valid: false, error: 'Token invalide' });
    }
});

module.exports = router;