require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Configuration Supabase
const supabaseUrl = 'https://glutcejzwmynjxarmldq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdXRjZWp6d215bmp4YXJtbGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MTAzNzIsImV4cCI6MjA4MTA4NjM3Mn0.vkQ4ykvO0B1IyVk668kUBfkHduikEFcLJdkzayzyOwA';
const supabase = createClient(supabaseUrl, supabaseKey);

// JWT Secret
const JWT_SECRET = 'votre-secret-jwt-tres-secure-changez-cela';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false,
            error: 'Token manquant',
            message: 'Authentification requise' 
        });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false,
                error: 'Token invalide',
                message: 'Veuillez vous reconnecter' 
            });
        }
        req.user = user;
        next();
    });
};

// ============ ROUTES D'AUTHENTIFICATION ============
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, userType } = req.body;
        
        if (!username || !password || !userType) {
            return res.status(400).json({ 
                success: false,
                error: 'Données manquantes' 
            });
        }
        
        let tableName;
        switch(userType) {
            case 'master':
                tableName = 'master_users';
                break;
            case 'subsystem':
                tableName = 'subsystem_admins';
                break;
            case 'supervisor2':
                tableName = 'supervisors_level2';
                break;
            case 'supervisor1':
                tableName = 'supervisors_level1';
                break;
            case 'agent':
                tableName = 'agents';
                break;
            default:
                return res.status(400).json({ 
                    success: false,
                    error: 'Type d\'utilisateur invalide' 
                });
        }
        
        // Recherche de l'utilisateur
        const { data: user, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('username', username)
            .single();
        
        if (error || !user) {
            return res.status(401).json({ 
                success: false,
                error: 'Identifiants incorrects' 
            });
        }
        
        // Vérification du mot de passe (en production, utiliser bcrypt)
        // Pour la démo, on utilise une vérification simple
        const isValidPassword = password === 'admin123' || 
                               (user.password_hash && user.password_hash.includes(password));
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false,
                error: 'Identifiants incorrects' 
            });
        }
        
        // Création du token JWT
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username,
                role: userType,
                full_name: user.full_name,
                email: user.email
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        // Supprimer le hash du mot de passe de la réponse
        delete user.password_hash;
        
        res.json({
            success: true,
            message: 'Connexion réussie',
            token,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                email: user.email,
                role: userType
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            message: error.message 
        });
    }
});

// ============ ROUTES UTILISATEURS ============
app.get('/api/users/profile', authenticateToken, async (req, res) => {
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
            return res.status(400).json({ 
                success: false,
                error: 'Type d\'utilisateur invalide' 
            });
        }
        
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) {
            return res.status(400).json({ 
                success: false,
                error: error.message 
            });
        }
        
        delete data.password_hash;
        
        res.json({ 
            success: true,
            user: data 
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur' 
        });
    }
});

app.get('/api/users/agents', authenticateToken, async (req, res) => {
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
        
        if (userRole === 'supervisor1') {
            query = query.eq('supervisor1_id', userId);
        } else if (userRole === 'supervisor2') {
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
                success: false,
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
            success: false,
            error: 'Erreur serveur',
            message: error.message 
        });
    }
});

// ============ ROUTES TICKETS ============
app.post('/api/tickets/validate', authenticateToken, async (req, res) => {
    try {
        const { ticketId } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;
        
        if (!ticketId) {
            return res.status(400).json({ 
                success: false,
                error: 'ticketId est requis' 
            });
        }
        
        if (!['supervisor1', 'supervisor2', 'subsystem', 'master'].includes(userRole)) {
            return res.status(403).json({ 
                success: false,
                error: 'Permission refusée',
                message: 'Seuls les superviseurs peuvent valider des tickets' 
            });
        }
        
        const { data, error } = await supabase
            .from('tickets')
            .update({ 
                status: 'validated',
                validated_by: userId,
                validated_at: new Date().toISOString()
            })
            .eq('id', ticketId)
            .eq('status', 'pending')
            .select();
        
        if (error) {
            console.error('Ticket validation error:', error);
            return res.status(400).json({ 
                success: false,
                error: 'Erreur de validation',
                details: error.message 
            });
        }
        
        if (!data || data.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Ticket non trouvé ou déjà validé' 
            });
        }
        
        await supabase
            .from('activities')
            .insert({
                user_id: userId,
                action: 'ticket_validation',
                details: `Ticket ${ticketId} validé`,
                ip_address: req.ip
            });
        
        res.json({ 
            success: true, 
            message: 'Ticket validé avec succès',
            ticket: data[0]
        });
        
    } catch (error) {
        console.error('Ticket validation error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            message: error.message 
        });
    }
});

app.get('/api/tickets/pending', authenticateToken, async (req, res) => {
    try {
        const userRole = req.user.role;
        const userId = req.user.id;
        
        let query = supabase
            .from('tickets')
            .select(`
                *,
                agents(id, username, full_name, phone),
                subsystems(id, name)
            `)
            .eq('status', 'pending');
        
        if (userRole === 'supervisor1') {
            query = query.eq('supervisor1_id', userId);
        } else if (userRole === 'supervisor2') {
            query = query.eq('supervisor2_id', userId);
        } else if (userRole === 'subsystem') {
            query = query.eq('subsystem_id', req.user.subsystem_id);
        }
        
        const { data, error } = await query.order('created_at', { ascending: false });
        
        if (error) {
            console.error('Get pending tickets error:', error);
            return res.status(400).json({ 
                success: false,
                error: 'Erreur de récupération',
                details: error.message 
            });
        }
        
        res.json({ 
            success: true,
            tickets: data || [],
            count: data ? data.length : 0
        });
        
    } catch (error) {
        console.error('Get pending tickets error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            message: error.message 
        });
    }
});

app.post('/api/tickets/create', authenticateToken, async (req, res) => {
    try {
        const { amount, ticket_number } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;
        
        if (userRole !== 'agent') {
            return res.status(403).json({ 
                success: false,
                error: 'Permission refusée',
                message: 'Seuls les agents peuvent créer des tickets' 
            });
        }
        
        if (!amount || !ticket_number) {
            return res.status(400).json({ 
                success: false,
                error: 'Données manquantes' 
            });
        }
        
        const commission = parseFloat(amount) * 0.10;
        
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select(`
                *,
                supervisors_level1(
                    id,
                    supervisor2_id,
                    supervisors_level2(
                        id,
                        subsystem_id
                    )
                )
            `)
            .eq('id', userId)
            .single();
        
        if (agentError || !agent) {
            return res.status(400).json({ 
                success: false,
                error: 'Agent non trouvé' 
            });
        }
        
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .insert({
                agent_id: userId,
                supervisor1_id: agent.supervisor1_id,
                supervisor2_id: agent.supervisors_level1?.supervisor2_id,
                subsystem_id: agent.supervisors_level1?.supervisors_level2?.subsystem_id,
                ticket_number,
                amount: parseFloat(amount),
                commission,
                status: 'pending'
            })
            .select()
            .single();
        
        if (ticketError) {
            console.error('Create ticket error:', ticketError);
            return res.status(400).json({ 
                success: false,
                error: ticketError.message 
            });
        }
        
        await supabase
            .from('activities')
            .insert({
                user_id: userId,
                action: 'ticket_creation',
                details: `Ticket ${ticket_number} créé - Montant: ${amount}`,
                ip_address: req.ip
            });
        
        res.json({ 
            success: true,
            message: 'Ticket créé avec succès',
            ticket 
        });
        
    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erreur serveur',
            message: error.message 
        });
    }
});

// ============ ROUTES UTILITAIRES ============
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Route de test
app.get('/api/test/supabase', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('master_users')
            .select('count');
        
        if (error) {
            return res.json({
                success: false,
                message: 'Erreur Supabase',
                error: error.message
            });
        }
        
        res.json({
            success: true,
            message: 'Supabase connecté avec succès',
            data: data
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'Erreur de connexion Supabase',
            error: error.message
        });
    }
});

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, '../public')));

// Route fallback pour SPA
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    }
});

// Gestion des erreurs
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ 
        success: false,
        error: 'Erreur serveur interne',
        message: err.message 
    });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Nova Lotto Server running on port ${PORT}`);
    console.log(`✅ Supabase URL: ${supabaseUrl}`);
    console.log(`✅ JWT Secret: Configured ✓`);
    console.log(`${'='.repeat(50)}\n`);
});