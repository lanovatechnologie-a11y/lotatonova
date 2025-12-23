require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://glutcejzwmynjxarmldq.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdXRjZWp6d215bmp4YXJtbGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MTAzNzIsImV4cCI6MjA4MTA4NjM3Mn0.vkQ4ykvO0B1IyVk668kUBfkHduikEFcLJdkzayzyOwA';
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET || 'votre-secret-jwt-tres-secure-changez-cela';

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques depuis la racine
app.use(express.static(__dirname));

// ============ ROUTES API ============

// 1. Route de santé
app.get('/api/health', async (req, res) => {
    try {
        // Tester la connexion Supabase
        const { data, error } = await supabase
            .from('agents')
            .select('*')
            .limit(1);
        
        res.json({
            success: true,
            message: 'Serveur Nova Lotto fonctionnel',
            timestamp: new Date().toISOString(),
            supabase: error ? 'Erreur de connexion' : 'Connecté',
            version: '1.0.0'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// 2. Route de connexion
app.post('/api/auth/login', async (req, res) => {
    console.log('Tentative de connexion:', req.body);
    
    try {
        const { username, password, userType = 'agent' } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Nom d\'utilisateur et mot de passe requis'
            });
        }
        
        let tableName;
        switch(userType) {
            case 'master': tableName = 'master_users'; break;
            case 'subsystem_admin': tableName = 'subsystem_admins'; break;
            case 'supervisor2': tableName = 'supervisors_level2'; break;
            case 'supervisor1': tableName = 'supervisors_level1'; break;
            case 'agent': 
            default: tableName = 'agents';
        }
        
        const { data: users, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('username', username)
            .eq('is_active', true)
            .limit(1);
        
        if (error) {
            console.error('Erreur Supabase:', error);
            return res.status(500).json({
                success: false,
                error: 'Erreur de base de données'
            });
        }
        
        if (!users || users.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Identifiant ou mot de passe incorrect'
            });
        }
        
        const user = users[0];
        
        // Vérification du mot de passe (bcrypt ou mot de passe test)
        const isValid = password === 'agent123' || 
                       (user.password_hash && bcrypt.compareSync(password, user.password_hash));
        
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Identifiant ou mot de passe incorrect'
            });
        }
        
        // Créer le token JWT
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                userType: userType,
                role: userType
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        console.log('Connexion réussie pour:', username);
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name || user.username,
                email: user.email || '',
                phone: user.phone || '',
                role: userType
            }
        });
        
    } catch (err) {
        console.error('Erreur de connexion:', err);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur interne'
        });
    }
});

// 3. Route pour créer un ticket
app.post('/api/tickets/create', async (req, res) => {
    try {
        const { ticket_number, amount, draw, time } = req.body;
        
        if (!ticket_number || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Numéro de ticket et montant requis'
            });
        }
        
        const ticketData = {
            id: Date.now().toString(),
            ticket_number,
            amount: parseFloat(amount),
            draw: draw || 'miami',
            time: time || 'morning',
            status: 'pending',
            created_at: new Date().toISOString()
        };
        
        console.log('Ticket créé:', ticketData);
        
        res.json({
            success: true,
            message: 'Ticket créé avec succès',
            ticket: ticketData
        });
        
    } catch (err) {
        console.error('Erreur création ticket:', err);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la création du ticket'
        });
    }
});

// 4. Route pour les tickets en attente
app.get('/api/tickets/pending', async (req, res) => {
    try {
        res.json({
            success: true,
            tickets: [],
            count: 0,
            message: 'Aucun ticket en attente'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// 5. Route test Supabase
app.get('/api/test/supabase', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('agents')
            .select('*')
            .limit(5);
        
        if (error) {
            throw error;
        }
        
        res.json({
            success: true,
            data: data,
            count: data.length
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// 6. Route profil utilisateur (optionnelle)
app.get('/api/users/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token manquant'
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({
            success: true,
            user: decoded
        });
    } catch (err) {
        res.status(401).json({
            success: false,
            error: 'Token invalide'
        });
    }
});

// ============ ROUTE FALLBACK ============
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'lotato.html'));
    } else {
        res.status(404).json({
            success: false,
            error: 'Route API non trouvée'
        });
    }
});

// ============ DÉMARRAGE SERVEUR ============
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 Serveur Nova Lotto démarré sur le port ${PORT}`);
    console.log(`📁 Dossier racine: ${__dirname}`);
    console.log(`🌐 URL: https://lotato.onrender.com`);
    console.log(`\n📊 Routes API disponibles:`);
    console.log(`  • GET  /api/health`);
    console.log(`  • POST /api/auth/login`);
    console.log(`  • POST /api/tickets/create`);
    console.log(`  • GET  /api/tickets/pending`);
    console.log(`  • GET  /api/test/supabase`);
    console.log(`  • GET  /api/users/profile`);
    console.log(`${'='.repeat(50)}\n`);
});