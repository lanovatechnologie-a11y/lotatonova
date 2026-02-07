const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configuration PostgreSQL avec Neon
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://username:password@ep-cool-fog-123456.us-east-2.aws.neon.tech/nova-lotto?sslmode=require',
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test de la connexion
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Erreur de connexion PostgreSQL:', err.message);
    } else {
        console.log('✅ PostgreSQL connecté avec succès !');
    }
});

// === MIDDLEWARE GZIP COMPRESSION ===
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// Middleware CORS
app.use(cors());

// Middleware standard
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve tous les fichiers statiques à la racine avec compression GZIP
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// =================== MIDDLEWARE DE VÉRIFICATION DE TOKEN ===================
function vérifierToken(req, res, next) {
    let token = req.query.token;
    
    if (!token && req.body) {
        token = req.body.token;
    }
    
    if (!token) {
        token = req.headers['x-auth-token'];
    }
    
    if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }
    
    if (!token || !token.startsWith('nova_')) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token manquant ou invalide' 
            });
        }
    }
    
    if (token && token.startsWith('nova_')) {
        const parts = token.split('_');
        if (parts.length >= 5) {
            req.tokenInfo = {
                token: token,
                userId: parts[2],
                role: parts[3],
                level: parts[4] || '1'
            };
        }
    }
    
    next();
}

// =================== MIDDLEWARE POUR L'ACCÈS AUX SOUS-SYSTÈMES ===================
async function vérifierAccèsSubsystem(req, res, next) {
    try {
        if (!req.tokenInfo) {
            return res.status(401).json({
                success: false,
                error: 'Non authentifié'
            });
        }

        const userQuery = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userQuery.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        const user = userQuery.rows[0];

        if (user.role === 'subsystem' || (user.role === 'supervisor' && user.level === 2)) {
            req.currentUser = user;
            next();
        } else {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé. Rôle subsystem ou superviseur level 2 requis.'
            });
        }
    } catch (error) {
        console.error('Erreur vérification accès sous-système:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la vérification des droits d\'accès'
        });
    }
}

// =================== MIDDLEWARE POUR LES AGENTS ===================
async function vérifierAgent(req, res, next) {
    try {
        if (!req.tokenInfo) {
            return res.status(401).json({
                success: false,
                error: 'Non authentifié'
            });
        }

        const userQuery = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userQuery.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        if (userQuery.rows[0].role !== 'agent') {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé. Rôle agent requis.'
            });
        }

        req.currentUser = userQuery.rows[0];
        next();
    } catch (error) {
        console.error('Erreur vérification agent:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la vérification des droits'
        });
    }
}

// =================== ROUTES DE CONNEXION ===================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        console.log('Tentative de connexion:', { username, password, role });
        
        let dbRole = role;
        let level = 1;
        
        if (role === 'supervisor1') {
            dbRole = 'supervisor';
            level = 1;
        } else if (role === 'supervisor2') {
            dbRole = 'supervisor';
            level = 2;
        }
        
        // Recherche de l'utilisateur
        let query = `
            SELECT * FROM users 
            WHERE username = $1 
            AND password = $2 
            AND role = $3
            ${dbRole === 'supervisor' ? 'AND level = $4' : ''}
        `;
        
        const params = dbRole === 'supervisor' 
            ? [username, password, dbRole, level]
            : [username, password, dbRole];
        
        const userResult = await pool.query(query, params);
        
        if (userResult.rows.length === 0) {
            console.log('Utilisateur non trouvé ou informations incorrectes');
            return res.status(401).json({
                success: false,
                error: 'Identifiants ou rôle incorrect'
            });
        }
        
        const user = userResult.rows[0];
        console.log('Utilisateur trouvé:', user.username, user.role, user.level);

        const token = `nova_${Date.now()}_${user.id}_${user.role}_${user.level || 1}`;

        let redirectUrl;
        switch (user.role) {
            case 'agent':
                redirectUrl = '/lotato.html';
                break;
            case 'supervisor':
                if (user.level === 1) {
                    redirectUrl = '/control-level1.html';
                } else if (user.level === 2) {
                    redirectUrl = '/control-level2.html';
                } else {
                    redirectUrl = '/supervisor-control.html';
                }
                break;
            case 'subsystem':
                redirectUrl = '/subsystem-admin.html';
                break;
            case 'master':
                redirectUrl = '/master-dashboard.html';
                break;
            default:
                redirectUrl = '/';
        }

        redirectUrl += `?token=${encodeURIComponent(token)}`;

        res.json({
            success: true,
            redirectUrl: redirectUrl,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Erreur login:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la connexion'
        });
    }
});

// =================== ROUTES POUR LOTATO ===================

// Route pour enregistrer un historique
app.post('/api/history', vérifierToken, async (req, res) => {
    try {
        const { draw, drawTime, bets, total } = req.body;

        if (!draw || !drawTime || !bets || total === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Données manquantes pour l\'historique'
            });
        }

        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        const user = userResult.rows[0];

        const historyResult = await pool.query(
            `INSERT INTO histories (date, draw, draw_time, bets, total, agent_id, agent_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [new Date(), draw, drawTime, JSON.stringify(bets), total, user.id, user.name]
        );

        res.json({
            success: true,
            message: 'Historique enregistré avec succès'
        });
    } catch (error) {
        console.error('Erreur enregistrement historique:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'enregistrement de l\'historique'
        });
    }
});

// Route pour récupérer l'historique de l'agent
app.get('/api/history', vérifierToken, async (req, res) => {
    try {
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const historyResult = await pool.query(
            `SELECT * FROM histories 
             WHERE agent_id = $1 
             ORDER BY date DESC 
             LIMIT $2 OFFSET $3`,
            [req.tokenInfo.userId, limit, offset]
        );

        const countResult = await pool.query(
            'SELECT COUNT(*) FROM histories WHERE agent_id = $1',
            [req.tokenInfo.userId]
        );

        const total = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            history: historyResult.rows.map(record => ({
                id: record.id,
                date: record.date,
                draw: record.draw,
                draw_time: record.draw_time,
                bets: record.bets,
                total: record.total
            })),
            pagination: {
                page: page,
                limit: limit,
                total: total,
                total_pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Erreur récupération historique:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de l\'historique'
        });
    }
});

// Route pour obtenir les tickets de l'agent
app.get('/api/tickets', vérifierToken, async (req, res) => {
    try {
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        const ticketsResult = await pool.query(
            `SELECT * FROM tickets 
             WHERE agent_id = $1 
             ORDER BY date DESC 
             LIMIT 100`,
            [req.tokenInfo.userId]
        );

        // Trouver le prochain numéro de ticket
        const lastTicketResult = await pool.query(
            'SELECT number FROM tickets ORDER BY number DESC LIMIT 1'
        );
        
        const nextTicketNumber = lastTicketResult.rows.length > 0 
            ? lastTicketResult.rows[0].number + 1 
            : 100001;

        res.json({
            success: true,
            tickets: ticketsResult.rows.map(ticket => ({
                id: ticket.id,
                number: ticket.number,
                date: ticket.date,
                draw: ticket.draw,
                draw_time: ticket.draw_time,
                bets: ticket.bets,
                total: ticket.total,
                agent_name: ticket.agent_name,
                subsystem_id: ticket.subsystem_id
            })),
            nextTicketNumber: nextTicketNumber
        });
    } catch (error) {
        console.error('Erreur chargement tickets:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des tickets'
        });
    }
});

// Route pour sauvegarder un ticket
app.post('/api/tickets', vérifierToken, async (req, res) => {
    try {
        const { 
            number, 
            draw, 
            draw_time, 
            bets, 
            total, 
            agent_id, 
            agent_name, 
            subsystem_id, 
            date 
        } = req.body;

        console.log('📥 Données reçues pour ticket:', {
            number, draw, draw_time, total,
            agent_id, agent_name, subsystem_id
        });

        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        const user = userResult.rows[0];

        // Vérifier le subsystem_id
        let finalSubsystemId = subsystem_id || user.subsystem_id;
        if (!finalSubsystemId) {
            return res.status(400).json({
                success: false,
                error: 'L\'agent doit être associé à un sous-système'
            });
        }

        // Vérifier si le numéro existe déjà
        let ticketNumber;
        if (number) {
            const existingTicketResult = await pool.query(
                'SELECT id FROM tickets WHERE number = $1',
                [number]
            );
            
            if (existingTicketResult.rows.length > 0) {
                const lastTicketResult = await pool.query(
                    'SELECT number FROM tickets ORDER BY number DESC LIMIT 1'
                );
                ticketNumber = lastTicketResult.rows.length > 0 
                    ? lastTicketResult.rows[0].number + 1 
                    : 100001;
            } else {
                ticketNumber = number;
            }
        } else {
            const lastTicketResult = await pool.query(
                'SELECT number FROM tickets ORDER BY number DESC LIMIT 1'
            );
            ticketNumber = lastTicketResult.rows.length > 0 
                ? lastTicketResult.rows[0].number + 1 
                : 100001;
        }

        // Créer le ticket
        const ticketResult = await pool.query(
            `INSERT INTO tickets (
                number, draw, draw_time, bets, total, 
                agent_id, agent_name, subsystem_id, date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [
                ticketNumber, 
                draw, 
                draw_time, 
                JSON.stringify(bets), 
                total || bets.reduce((sum, bet) => sum + bet.amount, 0),
                agent_id || user.id,
                agent_name || user.name,
                finalSubsystemId,
                date || new Date()
            ]
        );

        console.log('✅ Ticket sauvegardé:', ticketResult.rows[0].id);

        res.json({
            success: true,
            ticket: {
                id: ticketResult.rows[0].id,
                number: ticketResult.rows[0].number,
                date: ticketResult.rows[0].date,
                draw: ticketResult.rows[0].draw,
                draw_time: ticketResult.rows[0].draw_time,
                bets: ticketResult.rows[0].bets,
                total: ticketResult.rows[0].total,
                agent_name: ticketResult.rows[0].agent_name,
                subsystem_id: ticketResult.rows[0].subsystem_id
            }
        });
    } catch (error) {
        console.error('❌ Erreur sauvegarde fiche:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la sauvegarde de la fiche: ' + error.message
        });
    }
});

// Route pour les tickets en attente de l'agent
app.get('/api/tickets/pending', vérifierToken, async (req, res) => {
    try {
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        const ticketsResult = await pool.query(
            `SELECT * FROM tickets 
             WHERE agent_id = $1 AND is_synced = false 
             ORDER BY date DESC 
             LIMIT 50`,
            [req.tokenInfo.userId]
        );
        
        res.json({
            success: true,
            tickets: ticketsResult.rows.map(ticket => ({
                id: ticket.id,
                number: ticket.number,
                date: ticket.date,
                draw: ticket.draw,
                draw_time: ticket.draw_time,
                bets: ticket.bets,
                total: ticket.total,
                agent_name: ticket.agent_name
            }))
        });
    } catch (error) {
        console.error('Erreur tickets en attente:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des tickets en attente'
        });
    }
});

// Route pour les tickets gagnants de l'agent
app.get('/api/tickets/winning', vérifierToken, async (req, res) => {
    try {
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        const winnersResult = await pool.query(
            `SELECT * FROM winners 
             WHERE agent_id = $1 
             ORDER BY date DESC 
             LIMIT 50`,
            [req.tokenInfo.userId]
        );

        res.json({
            success: true,
            tickets: winnersResult.rows.map(winner => ({
                id: winner.id,
                ticket_number: winner.ticket_number,
                date: winner.date,
                draw: winner.draw,
                draw_time: winner.draw_time,
                winning_bets: winner.winning_bets,
                total_winnings: winner.total_winnings,
                paid: winner.paid
            }))
        });
    } catch (error) {
        console.error('Erreur chargement gagnants:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des gagnants'
        });
    }
});

// Route pour les fiches multi-tirages de l'agent
app.get('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
    try {
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        const ticketsResult = await pool.query(
            `SELECT * FROM multi_draw_tickets 
             WHERE agent_id = $1 
             ORDER BY date DESC 
             LIMIT 50`,
            [req.tokenInfo.userId]
        );
        
        res.json({
            success: true,
            tickets: ticketsResult.rows.map(ticket => ({
                id: ticket.id,
                number: ticket.number,
                date: ticket.date,
                bets: ticket.bets,
                draws: ticket.draws,
                total: ticket.total,
                agent_name: ticket.agent_name,
                subsystem_id: ticket.subsystem_id
            }))
        });
    } catch (error) {
        console.error('Erreur fiches multi-tirages:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des fiches multi-tirages'
        });
    }
});

// Route pour sauvegarder une fiche multi-tirages
app.post('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
    try {
        const { ticket } = req.body;

        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        const user = userResult.rows[0];

        const lastTicketResult = await pool.query(
            'SELECT number FROM multi_draw_tickets ORDER BY number DESC LIMIT 1'
        );
        
        const ticketNumber = lastTicketResult.rows.length > 0 
            ? lastTicketResult.rows[0].number + 1 
            : 500001;

        const multiDrawTicketResult = await pool.query(
            `INSERT INTO multi_draw_tickets (
                number, date, bets, draws, total, 
                agent_id, agent_name, subsystem_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                ticketNumber,
                new Date(),
                JSON.stringify(ticket.bets),
                JSON.stringify(Array.from(ticket.draws || [])),
                ticket.totalAmount || 0,
                user.id,
                user.name,
                user.subsystem_id
            ]
        );

        res.json({
            success: true,
            ticket: {
                id: multiDrawTicketResult.rows[0].id,
                number: multiDrawTicketResult.rows[0].number,
                date: multiDrawTicketResult.rows[0].date,
                bets: multiDrawTicketResult.rows[0].bets,
                draws: multiDrawTicketResult.rows[0].draws,
                total: multiDrawTicketResult.rows[0].total,
                agent_name: multiDrawTicketResult.rows[0].agent_name,
                subsystem_id: multiDrawTicketResult.rows[0].subsystem_id
            }
        });
    } catch (error) {
        console.error('Erreur sauvegarde fiche multi-tirages:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la sauvegarde de la fiche multi-tirages'
        });
    }
});

// Route pour obtenir les informations de l'entreprise
app.get('/api/company-info', vérifierToken, async (req, res) => {
    try {
        const configResult = await pool.query(
            'SELECT * FROM configs ORDER BY id DESC LIMIT 1'
        );
        
        let config = configResult.rows[0];
        
        if (!config) {
            const insertResult = await pool.query(
                'INSERT INTO configs DEFAULT VALUES RETURNING *'
            );
            config = insertResult.rows[0];
        }
        
        res.json({
            success: true,
            company_name: config.company_name,
            company_phone: config.company_phone,
            company_address: config.company_address,
            report_title: config.report_title,
            report_phone: config.report_phone
        });
    } catch (error) {
        console.error('Erreur chargement info entreprise:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des informations de l\'entreprise'
        });
    }
});

// Route pour le logo
app.get('/api/logo', vérifierToken, async (req, res) => {
    try {
        const configResult = await pool.query(
            'SELECT logo_url FROM configs ORDER BY id DESC LIMIT 1'
        );
        
        res.json({
            success: true,
            logoUrl: configResult.rows.length > 0 
                ? configResult.rows[0].logo_url 
                : 'logo-borlette.jpg'
        });
    } catch (error) {
        console.error('Erreur chargement logo:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement du logo'
        });
    }
});

// Route pour les résultats
app.get('/api/results', vérifierToken, async (req, res) => {
    try {
        const { draw, draw_time, date } = req.query;
        
        let query = 'SELECT * FROM results WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (draw) {
            query += ` AND draw = $${paramIndex}`;
            params.push(draw);
            paramIndex++;
        }
        
        if (draw_time) {
            query += ` AND draw_time = $${paramIndex}`;
            params.push(draw_time);
            paramIndex++;
        }
        
        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            
            query += ` AND date >= $${paramIndex} AND date < $${paramIndex + 1}`;
            params.push(startDate, endDate);
        }
        
        query += ' ORDER BY date DESC LIMIT 50';
        
        const resultsResult = await pool.query(query, params);
        
        // Convertir en format attendu
        const resultsDatabase = {};
        resultsResult.rows.forEach(result => {
            if (!resultsDatabase[result.draw]) {
                resultsDatabase[result.draw] = {};
            }
            resultsDatabase[result.draw][result.draw_time] = {
                date: result.date,
                lot1: result.lot1,
                lot2: result.lot2 || '',
                lot3: result.lot3 || ''
            };
        });
        
        res.json({
            success: true,
            results: resultsDatabase
        });
    } catch (error) {
        console.error('Erreur chargement résultats:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des résultats'
        });
    }
});

// Route pour vérifier les gagnants
app.post('/api/check-winners', vérifierToken, async (req, res) => {
    try {
        const { draw, draw_time } = req.body;
        
        // Récupérer le résultat du tirage
        const resultResult = await pool.query(
            `SELECT * FROM results 
             WHERE draw = $1 AND draw_time = $2 
             ORDER BY date DESC LIMIT 1`,
            [draw, draw_time]
        );
        
        if (resultResult.rows.length === 0) {
            return res.json({
                success: true,
                winningTickets: [],
                message: 'Aucun résultat trouvé pour ce tirage'
            });
        }
        
        const result = resultResult.rows[0];
        
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }
        
        const user = userResult.rows[0];
        
        // Récupérer les tickets de l'agent pour ce tirage
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const ticketsResult = await pool.query(
            `SELECT * FROM tickets 
             WHERE agent_id = $1 AND draw = $2 AND draw_time = $3 
             AND date >= $4`,
            [user.id, draw, draw_time, today]
        );
        
        const tickets = ticketsResult.rows;
        const winningTickets = [];
        
        // Vérifier chaque ticket
        for (const ticket of tickets) {
            const winningBets = [];
            
            for (const bet of ticket.bets) {
                let winAmount = 0;
                let winType = '';
                let matchedNumber = '';
                
                // Logique de vérification des gains
                if (bet.type === 'borlette' || bet.type === 'boulpe') {
                    const lot1Last2 = result.lot1.substring(1);
                    
                    if (bet.number === lot1Last2) {
                        winAmount = bet.amount * 60;
                        winType = '1er lot';
                        matchedNumber = lot1Last2;
                    } else if (bet.number === result.lot2) {
                        winAmount = bet.amount * 20;
                        winType = '2e lot';
                        matchedNumber = result.lot2;
                    } else if (bet.number === result.lot3) {
                        winAmount = bet.amount * 10;
                        winType = '3e lot';
                        matchedNumber = result.lot3;
                    }
                } else if (bet.type === 'lotto3') {
                    if (bet.number === result.lot1) {
                        winAmount = bet.amount * 500;
                        winType = 'Lotto 3';
                        matchedNumber = result.lot1;
                    }
                } else if (bet.type === 'marriage') {
                    const [num1, num2] = bet.number.split('*');
                    const numbers = [result.lot1.substring(1), result.lot2, result.lot3];
                    
                    if (numbers.includes(num1) && numbers.includes(num2)) {
                        winAmount = bet.amount * 1000;
                        winType = 'Maryaj';
                        matchedNumber = `${num1}*${num2}`;
                    }
                } else if (bet.type === 'grap') {
                    if (result.lot1[0] === result.lot1[1] && result.lot1[1] === result.lot1[2]) {
                        if (bet.number === result.lot1) {
                            winAmount = bet.amount * 500;
                            winType = 'Grap';
                            matchedNumber = result.lot1;
                        }
                    }
                }
                
                if (winAmount > 0) {
                    winningBets.push({
                        type: bet.type,
                        name: bet.name,
                        number: bet.number,
                        matched_number: matchedNumber,
                        win_type: winType,
                        win_amount: winAmount
                    });
                }
            }
            
            if (winningBets.length > 0) {
                const totalWinnings = winningBets.reduce((sum, bet) => sum + bet.win_amount, 0);
                
                // Créer un enregistrement de gagnant
                await pool.query(
                    `INSERT INTO winners (
                        ticket_id, ticket_number, draw, draw_time, date,
                        winning_bets, total_winnings, agent_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        ticket.id,
                        ticket.number,
                        ticket.draw,
                        ticket.draw_time,
                        new Date(),
                        JSON.stringify(winningBets),
                        totalWinnings,
                        user.id
                    ]
                );
                
                winningTickets.push({
                    id: ticket.id,
                    number: ticket.number,
                    date: ticket.date,
                    draw: ticket.draw,
                    draw_time: ticket.draw_time,
                    result: {
                        lot1: result.lot1,
                        lot2: result.lot2,
                        lot3: result.lot3
                    },
                    winningBets: winningBets,
                    totalWinnings: totalWinnings
                });
            }
        }
        
        res.json({
            success: true,
            winningTickets: winningTickets
        });
    } catch (error) {
        console.error('Erreur vérification gagnants:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la vérification des gagnants'
        });
    }
});

// =================== ROUTES API EXISTANTES ===================

app.get('/api/health', async (req, res) => {
    try {
        const dbResult = await pool.query('SELECT NOW()');
        res.json({ 
            success: true, 
            status: 'online', 
            timestamp: new Date().toISOString(),
            database: dbResult.rows ? 'connected' : 'disconnected'
        });
    } catch (error) {
        res.json({
            success: false,
            status: 'online',
            database: 'disconnected'
        });
    }
});

app.get('/api/auth/verify', (req, res) => {
    try {
        const token = req.query.token;
        
        if (!token || !token.startsWith('nova_')) {
            return res.json({
                success: false,
                valid: false
            });
        }
        
        res.json({
            success: true,
            valid: true
        });
    } catch (error) {
        res.json({
            success: false,
            valid: false
        });
    }
});

app.get('/api/auth/check', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo) {
            return res.status(401).json({
                success: false,
                error: 'Session invalide'
            });
        }
        
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }
        
        const user = userResult.rows[0];
        
        // Récupérer les informations du sous-système
        let subsystem = null;
        if (user.subsystem_id) {
            const subsystemResult = await pool.query(
                'SELECT * FROM subsystems WHERE id = $1',
                [user.subsystem_id]
            );
            subsystem = subsystemResult.rows[0];
        }
        
        res.json({
            success: true,
            admin: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level,
                email: user.email,
                subsystem_id: user.subsystem_id,
                subsystem_name: subsystem ? subsystem.name : 'Non spécifié'
            }
        });
    } catch (error) {
        console.error('Erreur vérification session:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la vérification de la session'
        });
    }
});

// =================== ROUTES POUR LE MASTER DASHBOARD ===================

// Route d'initialisation master
app.post('/api/master/init', async (req, res) => {
    try {
        const { masterUsername, masterPassword, companyName, masterEmail } = req.body;
        
        // Vérifier si un master existe déjà
        const existingMasterResult = await pool.query(
            'SELECT * FROM users WHERE role = $1',
            ['master']
        );
        
        if (existingMasterResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Un compte master existe déjà'
            });
        }
        
        // Créer l'utilisateur master
        const masterUserResult = await pool.query(
            `INSERT INTO users (username, password, name, email, role, level)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [
                masterUsername || 'master',
                masterPassword || 'master123',
                companyName || 'Master Admin',
                masterEmail || 'master@novalotto.com',
                'master',
                1
            ]
        );
        
        const masterUser = masterUserResult.rows[0];
        const token = `nova_${Date.now()}_${masterUser.id}_master_1`;
        
        res.json({
            success: true,
            token: token,
            user: {
                id: masterUser.id,
                username: masterUser.username,
                name: masterUser.name,
                role: masterUser.role,
                level: masterUser.level,
                email: masterUser.email,
                full_name: masterUser.name
            }
        });
        
    } catch (error) {
        console.error('Erreur initialisation master:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'initialisation'
        });
    }
});

// Route de connexion master
app.post('/api/master/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const userResult = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2 AND role = $3',
            [username, password, 'master']
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Identifiants master incorrects'
            });
        }
        
        const user = userResult.rows[0];
        const token = `nova_${Date.now()}_${user.id}_master_1`;
        
        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level,
                email: user.email,
                full_name: user.name
            }
        });
        
    } catch (error) {
        console.error('Erreur connexion master:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la connexion'
        });
    }
});

// =================== ROUTES POUR LES SOUS-SYSTÈMES ===================

// Routes Master pour les sous-systèmes
app.post('/api/master/subsystems', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé. Rôle master requis.'
            });
        }

        const {
            name,
            subdomain,
            contact_email,
            contact_phone,
            max_users,
            subscription_type,
            subscription_months
        } = req.body;

        if (!name || !subdomain || !contact_email) {
            return res.status(400).json({
                success: false,
                error: 'Le nom, le sous-domaine et l\'email de contact sont obligatoires'
            });
        }

        // Vérifier si le sous-domaine existe déjà
        const existingSubsystemResult = await pool.query(
            'SELECT * FROM subsystems WHERE subdomain = $1',
            [subdomain.toLowerCase()]
        );
        
        if (existingSubsystemResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Ce sous-domaine est déjà utilisé'
            });
        }

        // Vérifier si l'utilisateur admin existe déjà
        let adminUserResult = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [contact_email]
        );
        
        let adminUser;
        
        if (adminUserResult.rows.length === 0) {
            const generatedPassword = Math.random().toString(36).slice(-8);

            adminUserResult = await pool.query(
                `INSERT INTO users (username, password, name, email, role, level)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [
                    contact_email,
                    generatedPassword,
                    name,
                    contact_email,
                    'subsystem',
                    1
                ]
            );
            adminUser = adminUserResult.rows[0];
        } else {
            adminUser = adminUserResult.rows[0];
            if (adminUser.role !== 'subsystem') {
                return res.status(400).json({
                    success: false,
                    error: 'Cet email est déjà utilisé avec un rôle différent'
                });
            }
        }

        // Calculer la date d'expiration
        const subscription_expires = new Date();
        subscription_expires.setMonth(subscription_expires.getMonth() + (subscription_months || 1));

        // Créer le sous-système
        const subsystemResult = await pool.query(
            `INSERT INTO subsystems (
                name, subdomain, contact_email, contact_phone, max_users,
                subscription_type, subscription_months, subscription_expires,
                admin_user, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [
                name,
                subdomain.toLowerCase(),
                contact_email,
                contact_phone,
                max_users || 10,
                subscription_type || 'standard',
                subscription_months || 1,
                subscription_expires,
                adminUser.id,
                true
            ]
        );

        const subsystem = subsystemResult.rows[0];

        // Mettre à jour l'utilisateur admin avec le subsystem_id
        await pool.query(
            'UPDATE users SET subsystem_id = $1 WHERE id = $2',
            [subsystem.id, adminUser.id]
        );

        // Obtenir le domaine de base
        let domain = 'novalotto.com';
        if (req.headers.host) {
            const hostParts = req.headers.host.split('.');
            if (hostParts.length > 2) {
                domain = hostParts.slice(1).join('.');
            } else {
                domain = req.headers.host;
            }
        }
        
        domain = domain.replace('master.', '');
        const access_url = `https://${subdomain.toLowerCase()}.${domain}`;

        res.json({
            success: true,
            subsystem: {
                id: subsystem.id,
                name: subsystem.name,
                subdomain: subsystem.subdomain,
                contact_email: subsystem.contact_email,
                contact_phone: subsystem.contact_phone,
                max_users: subsystem.max_users,
                subscription_type: subsystem.subscription_type,
                subscription_expires: subsystem.subscription_expires,
                is_active: subsystem.is_active,
                created_at: subsystem.created_at
            },
            admin_credentials: {
                username: contact_email,
                password: adminUser.password,
                email: contact_email
            },
            access_url: access_url
        });

    } catch (error) {
        console.error('Erreur création sous-système:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la création du sous-système: ' + error.message
        });
    }
});

// Route pour lister les sous-systèmes
app.get('/api/master/subsystems', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé. Rôle master requis.'
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search;
        const status = req.query.status;

        let query = 'SELECT * FROM subsystems';
        let countQuery = 'SELECT COUNT(*) FROM subsystems';
        const params = [];
        const countParams = [];
        let paramIndex = 1;

        // Appliquer les filtres
        if (search || status) {
            let whereConditions = [];
            
            if (search) {
                whereConditions.push(`(name ILIKE $${paramIndex} OR subdomain ILIKE $${paramIndex} OR contact_email ILIKE $${paramIndex})`);
                params.push(`%${search}%`);
                countParams.push(`%${search}%`);
                paramIndex++;
            }
            
            if (status && status !== 'all') {
                if (status === 'active') {
                    whereConditions.push(`is_active = $${paramIndex}`);
                    params.push(true);
                    countParams.push(true);
                } else if (status === 'inactive') {
                    whereConditions.push(`is_active = $${paramIndex}`);
                    params.push(false);
                    countParams.push(false);
                } else if (status === 'expired') {
                    whereConditions.push(`subscription_expires < NOW()`);
                }
                paramIndex++;
            }
            
            if (whereConditions.length > 0) {
                const whereClause = ' WHERE ' + whereConditions.join(' AND ');
                query += whereClause;
                countQuery += whereClause;
            }
        }

        // Ajouter la pagination et le tri
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        // Exécuter les requêtes
        const subsystemsResult = await pool.query(query, params);
        const countResult = await pool.query(countQuery, countParams);
        
        const total = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(total / limit);

        // Pour chaque sous-système, récupérer le nombre d'utilisateurs actifs
        const subsystemsWithStats = await Promise.all(subsystemsResult.rows.map(async (subsystem) => {
            const activeUsersResult = await pool.query(
                'SELECT COUNT(*) FROM users WHERE subsystem_id = $1 AND is_active = true AND role IN ($2, $3)',
                [subsystem.id, 'agent', 'supervisor']
            );
            
            const activeUsers = parseInt(activeUsersResult.rows[0].count);
            const usage_percentage = subsystem.max_users > 0 ? 
                Math.round((activeUsers / subsystem.max_users) * 100) : 0;
            
            return {
                id: subsystem.id,
                name: subsystem.name,
                subdomain: subsystem.subdomain,
                contact_email: subsystem.contact_email,
                contact_phone: subsystem.contact_phone,
                max_users: subsystem.max_users,
                subscription_type: subsystem.subscription_type,
                subscription_expires: subsystem.subscription_expires,
                is_active: subsystem.is_active,
                created_at: subsystem.created_at,
                stats: {
                    active_users: activeUsers,
                    today_sales: subsystem.today_sales || 0,
                    today_tickets: subsystem.today_tickets || 0,
                    usage_percentage: usage_percentage
                },
                users: activeUsers
            };
        }));

        res.json({
            success: true,
            subsystems: subsystemsWithStats,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                total_pages: totalPages
            }
        });

    } catch (error) {
        console.error('Erreur listage sous-systèmes:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors du listage des sous-systèmes'
        });
    }
});

// =================== ROUTES POUR LES ADMINISTRATEURS DE SOUS-SYSTÈMES ===================

// Route pour créer un utilisateur dans un sous-système
app.post('/api/subsystem/users/create', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
    try {
        const currentUser = req.currentUser;
        const { 
            name, 
            username, 
            password, 
            role, 
            level, 
            supervisorId, 
            supervisorType 
        } = req.body;

        // Validation des données
        if (!name || !username || !password || !role) {
            return res.status(400).json({
                success: false,
                error: 'Nom, identifiant, mot de passe et rôle sont obligatoires'
            });
        }

        // Récupérer le sous-système
        const subsystemResult = await pool.query(
            'SELECT * FROM subsystems WHERE id = $1',
            [currentUser.subsystem_id]
        );
        
        if (subsystemResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Sous-système non trouvé'
            });
        }

        const subsystem = subsystemResult.rows[0];

        // Vérifier la limite d'utilisateurs
        const activeUsersResult = await pool.query(
            `SELECT COUNT(*) FROM users 
             WHERE subsystem_id = $1 AND is_active = true 
             AND role IN ('agent', 'supervisor')`,
            [subsystem.id]
        );

        const activeUsersCount = parseInt(activeUsersResult.rows[0].count);

        if (activeUsersCount >= subsystem.max_users) {
            return res.status(400).json({
                success: false,
                error: `Limite d'utilisateurs atteinte (${subsystem.max_users} maximum)`
            });
        }

        // Vérifier si l'identifiant existe déjà
        const existingUserResult = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        
        if (existingUserResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cet identifiant est déjà utilisé'
            });
        }

        // Déterminer le niveau pour les superviseurs
        let userLevel = 1;
        if (role === 'supervisor') {
            userLevel = level || 1;
        } else if (role === 'agent') {
            userLevel = 1;
        }

        // Créer l'utilisateur
        const newUserResult = await pool.query(
            `INSERT INTO users (
                username, password, name, role, level, 
                subsystem_id, is_active, date_creation
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                username,
                password,
                name,
                role,
                userLevel,
                subsystem.id,
                true,
                new Date()
            ]
        );

        const newUser = newUserResult.rows[0];

        // Assigner un superviseur si spécifié
        if (role === 'agent' && supervisorId) {
            // Vérifier que le superviseur appartient au même sous-système
            const supervisorResult = await pool.query(
                `SELECT * FROM users 
                 WHERE id = $1 AND subsystem_id = $2 AND role = 'supervisor'`,
                [supervisorId, subsystem.id]
            );

            if (supervisorResult.rows.length > 0) {
                if (supervisorType === 'supervisor1') {
                    await pool.query(
                        'UPDATE users SET supervisor_id = $1 WHERE id = $2',
                        [supervisorId, newUser.id]
                    );
                } else if (supervisorType === 'supervisor2') {
                    await pool.query(
                        'UPDATE users SET supervisor2_id = $1 WHERE id = $2',
                        [supervisorId, newUser.id]
                    );
                }
            }
        }

        // Mettre à jour les statistiques du sous-système
        await pool.query(
            `UPDATE subsystems 
             SET active_users = $1, 
                 usage_percentage = ROUND(($1 * 100.0) / NULLIF(max_users, 0), 2)
             WHERE id = $2`,
            [activeUsersCount + 1, subsystem.id]
        );

        res.json({
            success: true,
            message: 'Utilisateur créé avec succès',
            user: {
                id: newUser.id,
                name: newUser.name,
                username: newUser.username,
                role: newUser.role,
                level: newUser.level
            }
        });

    } catch (error) {
        console.error('Erreur création utilisateur:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la création de l\'utilisateur'
        });
    }
});

// Route pour lister les utilisateurs du sous-système
app.get('/api/subsystem/users', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
    try {
        const user = req.currentUser;
        const { role, status } = req.query;

        let query = 'SELECT * FROM users WHERE subsystem_id = $1';
        const params = [user.subsystem_id];
        let paramIndex = 2;

        // Filtrer par rôle si spécifié
        if (role) {
            if (role === 'supervisor1') {
                query += ` AND role = $${paramIndex} AND level = $${paramIndex + 1}`;
                params.push('supervisor', 1);
                paramIndex += 2;
            } else if (role === 'supervisor2') {
                query += ` AND role = $${paramIndex} AND level = $${paramIndex + 1}`;
                params.push('supervisor', 2);
                paramIndex += 2;
            } else {
                query += ` AND role = $${paramIndex}`;
                params.push(role);
                paramIndex++;
            }
        }

        // Filtrer par statut si spécifié
        if (status) {
            query += ` AND is_active = $${paramIndex}`;
            params.push(status === 'active');
            paramIndex++;
        }

        query += ' ORDER BY date_creation DESC';

        const usersResult = await pool.query(query, params);

        // Ajouter des statistiques pour chaque utilisateur
        const usersWithStats = await Promise.all(usersResult.rows.map(async (user) => {
            // Statistiques pour les agents
            if (user.role === 'agent') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const ticketsResult = await pool.query(
                    `SELECT COUNT(*) as count, SUM(total) as sales 
                     FROM tickets 
                     WHERE agent_id = $1 AND date >= $2`,
                    [user.id, today]
                );

                return {
                    ...user,
                    tickets_today: parseInt(ticketsResult.rows[0].count || 0),
                    sales_today: parseFloat(ticketsResult.rows[0].sales || 0),
                    is_online: Math.random() > 0.3
                };
            }

            // Statistiques pour les superviseurs
            if (user.role === 'supervisor') {
                const agentsResult = await pool.query(
                    `SELECT COUNT(*) FROM users 
                     WHERE subsystem_id = $1 
                     AND role = 'agent' 
                     AND (supervisor_id = $2 OR supervisor2_id = $2)`,
                    [user.subsystem_id, user.id]
                );

                return {
                    ...user,
                    agents_count: parseInt(agentsResult.rows[0].count || 0),
                    is_online: Math.random() > 0.3
                };
            }

            return {
                ...user,
                is_online: Math.random() > 0.3
            };
        }));

        res.json({
            success: true,
            users: usersWithStats
        });

    } catch (error) {
        console.error('Erreur récupération utilisateurs:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la récupération des utilisateurs'
        });
    }
});

// =================== ROUTES POUR LES SUPERVISEURS NIVEAU 1 ===================

// Route pour obtenir les statistiques des agents
app.get('/api/supervisor1/agent-stats', vérifierToken, async (req, res) => {
    try {
        const userResult = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [req.tokenInfo.userId]
        );
        
        if (userResult.rows.length === 0 || userResult.rows[0].role !== 'supervisor' || userResult.rows[0].level !== 1) {
            return res.status(403).json({
                success: false,
                error: 'Accès refusé. Rôle superviseur level 1 requis.'
            });
        }

        const supervisor = userResult.rows[0];

        // Récupérer les agents assignés à ce superviseur
        const agentsResult = await pool.query(
            `SELECT * FROM users 
             WHERE role = 'agent' 
             AND subsystem_id = $1
             AND (supervisor_id = $2 OR supervisor2_id = $2)
             AND is_active = true`,
            [supervisor.subsystem_id, supervisor.id]
        );

        const agents = agentsResult.rows;
        const agentStats = await Promise.all(agents.map(async (agent) => {
            // Compter les tickets de l'agent aujourd'hui
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const ticketsResult = await pool.query(
                `SELECT COUNT(*) as count, SUM(total) as sales 
                 FROM tickets 
                 WHERE agent_id = $1 AND date >= $2`,
                [agent.id, today]
            );

            const ticketsCount = parseInt(ticketsResult.rows[0].count || 0);
            const totalSales = parseFloat(ticketsResult.rows[0].sales || 0);

            return {
                id: agent.id,
                name: agent.name,
                username: agent.username,
                tickets_today: ticketsCount,
                sales_today: totalSales,
                is_online: Math.random() > 0.3
            };
        }));

        // Calculer les totaux
        const totals = {
            total_agents: agents.length,
            total_tickets: agentStats.reduce((sum, stat) => sum + stat.tickets_today, 0),
            total_sales: agentStats.reduce((sum, stat) => sum + stat.sales_today, 0),
            online_agents: agentStats.filter(stat => stat.is_online).length
        };

        res.json({
            success: true,
            agents: agentStats,
            totals: totals
        });

    } catch (error) {
        console.error('Erreur récupération statistiques agents:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la récupération des statistiques'
        });
    }
});

// =================== ROUTES HTML ===================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/*.html', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.status(404).send('Page non trouvée');
        }
        
        res.sendFile(filePath);
    });
});

app.get('/subsystem-admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

app.get('/control-level1.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/supervisor-control.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'supervisor-control.html'));
});

app.get('/master-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

app.get('/lotato.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// =================== MIDDLEWARE DE GESTION D'ERREURS ===================

app.use((err, req, res, next) => {
    if (err) {
        console.error('Erreur serveur:', err);
        
        if (req.path.startsWith('/api/')) {
            return res.status(500).json({
                success: false,
                error: 'Erreur serveur interne'
            });
        }
        
        return res.status(500).send('Erreur serveur interne');
    }
    next();
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'Route API non trouvée'
        });
    }
    
    res.status(404).send('Page non trouvée');
});

// =================== DÉMARRAGE DU SERVEUR ===================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📁 Compression GZIP activée`);
    console.log(`🌐 CORS activé`);
    console.log(`🐘 PostgreSQL connecté à Neon`);
    console.log(`👑 Master Dashboard: http://localhost:${PORT}/master-dashboard.html`);
    console.log(`🏢 Subsystem Admin: http://localhost:${PORT}/subsystem-admin.html`);
    console.log(`🎰 LOTATO: http://localhost:${PORT}/lotato.html`);
    console.log(`👮 Control Level 1: http://localhost:${PORT}/control-level1.html`);
    console.log(`👮 Control Level 2: http://localhost:${PORT}/control-level2.html`);
    console.log(`📊 Supervisor Control: http://localhost:${PORT}/supervisor-control.html`);
    console.log(`🏠 Login: http://localhost:${PORT}/`);
    console.log('');
    console.log('✅ Serveur prêt avec toutes les routes !');
});