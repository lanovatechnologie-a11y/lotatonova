// server.js pour Lotato avec MongoDB existant
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const cors = require('cors');

const app = express();

// === MIDDLEWARE ===
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

// Middleware pour parser le JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS pour permettre les requêtes depuis le frontend
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// === CONNEXION MONGODB ===
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lotato_db';
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Erreur de connexion MongoDB:'));
db.once('open', () => {
    console.log('✅ MongoDB connecté avec succès !');
    initializeDatabase();
});

// === SCHÉMAS MONGODB ===
// Utilisation des schémas existants de votre base

// Schéma pour les tickets (nouvelle collection)
const ticketSchema = new mongoose.Schema({
    ticketNumber: { type: Number, required: true, index: true },
    date: { type: Date, default: Date.now },
    draw: { type: String, required: true },
    drawTime: { type: String, required: true },
    bets: { type: Array, required: true },
    totalAmount: { type: Number, required: true },
    agentName: { type: String, default: 'Agent' },
    agentId: { type: String },
    agentUsername: { type: String },
    status: { 
        type: String, 
        default: 'active',
        enum: ['active', 'pending', 'won', 'lost', 'cancelled', 'printed']
    },
    isMultiDraw: { type: Boolean, default: false },
    draws: { type: Array },
    isWinner: { type: Boolean, default: false },
    winAmount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    printedAt: { type: Date },
    syncStatus: { type: String, default: 'pending' } // pending, synced, failed
});

// Schéma pour les résultats
const resultSchema = new mongoose.Schema({
    draw: { type: String, required: true },
    drawTime: { type: String, required: true },
    date: { type: Date, required: true },
    lot1: { type: String, required: true },
    lot2: { type: String, required: true },
    lot3: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    verified: { type: Boolean, default: false }
});

// Schéma pour l'historique
const historySchema = new mongoose.Schema({
    action: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId },
    userRole: { type: String },
    username: { type: String },
    details: { type: Object },
    ipAddress: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Schéma pour les informations de l'entreprise
const companyInfoSchema = new mongoose.Schema({
    name: { type: String, required: true, default: 'Nova Lotto' },
    phone: { type: String, default: '+509 32 53 49 58' },
    address: { type: String, default: 'Cap Haïtien' },
    reportTitle: { type: String, default: 'Nova Lotto' },
    reportPhone: { type: String, default: '40104585' },
    logoUrl: { type: String, default: '/logo-borlette.jpg' },
    updatedAt: { type: Date, default: Date.now }
});

// Schéma pour les jeux et multiplicateurs
const gameConfigSchema = new mongoose.Schema({
    gameType: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    multiplier: { type: Number, required: true },
    multiplier2: { type: Number },
    multiplier3: { type: Number },
    description: { type: String },
    category: { type: String },
    isActive: { type: Boolean, default: true },
    minAmount: { type: Number, default: 1 },
    maxAmount: { type: Number, default: 100000 }
});

// Modèles
const Ticket = mongoose.model('Ticket', ticketSchema);
const Result = mongoose.model('Result', resultSchema);
const History = mongoose.model('History', historySchema);
const CompanyInfo = mongoose.model('CompanyInfo', companyInfoSchema);
const GameConfig = mongoose.model('GameConfig', gameConfigSchema);

// Modèle User existant (basé sur votre structure)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    dateCreation: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    level: { type: Number, default: 1 }
}, { collection: 'users' }); // S'assurer d'utiliser la collection existante

const User = mongoose.model('User', userSchema);

// === INITIALISATION DE LA BASE DE DONNÉES ===
async function initializeDatabase() {
    try {
        // Vérifier si les collections nécessaires existent, sinon créer des données par défaut
        const companyInfoCount = await CompanyInfo.countDocuments();
        if (companyInfoCount === 0) {
            const defaultCompanyInfo = new CompanyInfo({
                name: 'Nova Lotto',
                phone: '+509 32 53 49 58',
                address: 'Cap Haïtien',
                reportTitle: 'Nova Lotto',
                reportPhone: '40104585',
                logoUrl: '/logo-borlette.jpg'
            });
            await defaultCompanyInfo.save();
            console.log('✅ Informations de l\'entreprise créées');
        }

        // Initialiser les configurations de jeu
        const gameConfigCount = await GameConfig.countDocuments();
        if (gameConfigCount === 0) {
            const defaultGames = [
                {
                    gameType: 'borlette',
                    name: 'BORLETTE',
                    multiplier: 60,
                    multiplier2: 20,
                    multiplier3: 10,
                    description: '2 chif (1er lot ×60, 2e ×20, 3e ×10)',
                    category: 'borlette'
                },
                {
                    gameType: 'boulpe',
                    name: 'BOUL PE',
                    multiplier: 60,
                    multiplier2: 20,
                    multiplier3: 10,
                    description: 'Boul pe (00-99)',
                    category: 'borlette'
                },
                {
                    gameType: 'lotto3',
                    name: 'LOTO 3',
                    multiplier: 500,
                    description: '3 chif (lot 1 + 1 chif devan)',
                    category: 'lotto'
                },
                {
                    gameType: 'lotto4',
                    name: 'LOTO 4',
                    multiplier: 5000,
                    description: '4 chif (lot 1+2 accumulate) - 3 opsyon',
                    category: 'lotto'
                },
                {
                    gameType: 'lotto5',
                    name: 'LOTO 5',
                    multiplier: 25000,
                    description: '5 chif (lot 1+2+3 accumulate) - 3 opsyon',
                    category: 'lotto'
                },
                {
                    gameType: 'grap',
                    name: 'GRAP',
                    multiplier: 500,
                    description: 'Grap boule paire (111, 222, ..., 000)',
                    category: 'special'
                },
                {
                    gameType: 'marriage',
                    name: 'MARYAJ',
                    multiplier: 1000,
                    description: 'Maryaj 2 chif (ex: 12*34)',
                    category: 'special'
                }
            ];
            
            await GameConfig.insertMany(defaultGames);
            console.log('✅ Configurations de jeu créées');
        }

        // Créer des index pour optimiser les recherches
        await Ticket.createIndexes();
        await Result.createIndexes();
        
        console.log('✅ Base de données initialisée avec succès !');
        
        // Afficher le nombre d'utilisateurs existants
        const userCount = await User.countDocuments();
        console.log(`📊 ${userCount} utilisateurs existants dans la base`);
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation de la base de données:', error);
    }
}

// === MIDDLEWARE D'AUTHENTIFICATION ===
function verifyToken(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    
    if (!token) {
        // Vérifier aussi dans les query params (pour les pages HTML)
        const tokenFromQuery = req.query.token;
        if (tokenFromQuery && tokenFromQuery.startsWith('nova_')) {
            req.token = tokenFromQuery;
            const parts = tokenFromQuery.split('_');
            if (parts.length >= 5) {
                req.user = {
                    id: parts[2],
                    role: parts[3],
                    level: parts[4] || '1'
                };
                return next();
            }
        }
        
        return res.status(401).json({ 
            success: false, 
            error: 'Token manquant' 
        });
    }
    
    // Vérification simple du token
    if (token.startsWith('nova_')) {
        const parts = token.split('_');
        if (parts.length >= 5) {
            req.user = {
                id: parts[2],
                role: parts[3],
                level: parts[4] || '1'
            };
            return next();
        }
    }
    
    return res.status(401).json({ 
        success: false, 
        error: 'Token invalide' 
    });
}

// === ROUTES D'AUTHENTIFICATION ===
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        console.log('Tentative de connexion:', { username, role });
        
        // Recherche de l'utilisateur dans MongoDB
        const user = await User.findOne({ 
            username: username,
            password: password,
            role: role,
            isActive: true
        });
        
        if (!user) {
            console.log('Utilisateur non trouvé ou inactif');
            return res.status(401).json({
                success: false,
                error: 'Identifiants ou rôle incorrect'
            });
        }
        
        console.log('Utilisateur trouvé:', user.username, user.role);
        
        // Mettre à jour la dernière connexion
        await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
        
        // Génération du token au format attendu par Lotato
        const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;
        
        // Détermination de l'URL de redirection
        let redirectUrl;
        switch (user.role) {
            case 'agent':
                redirectUrl = '/lotato.html';
                break;
            case 'supervisor':
                redirectUrl = '/supervisor-control.html';
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
        
        // Ajouter le token à l'URL
        redirectUrl += `?token=${encodeURIComponent(token)}`;
        
        // Enregistrer l'historique de connexion
        await History.create({
            action: 'login',
            userId: user._id,
            userRole: user.role,
            username: user.username,
            details: { username: user.username, role: user.role },
            ipAddress: req.ip
        });
        
        res.json({
            success: true,
            redirectUrl: redirectUrl,
            token: token,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level || 1
            }
        });
    } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la connexion'
        });
    }
});

// === ROUTES API POUR LOTATO ===

// Route de santé
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'online', 
        timestamp: new Date().toISOString(),
        database: db.readyState === 1 ? 'connected' : 'disconnected',
        message: 'Lotato API est en ligne'
    });
});

// Route pour vérifier un token
app.get('/api/auth/verify', (req, res) => {
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
});

// === ROUTES PROTÉGÉES PAR TOKEN ===

// Récupérer les résultats
app.get('/api/results', verifyToken, async (req, res) => {
    try {
        // Récupérer les derniers résultats de la base de données
        const results = await Result.find().sort({ date: -1 }).limit(50);
        
        // Formater les résultats selon le format attendu par Lotato
        const formattedResults = {};
        
        // Tirages par défaut
        const draws = ['miami', 'georgia', 'newyork', 'texas', 'tunisia'];
        const times = ['morning', 'evening'];
        
        // Si pas de résultats en base, créer des données par défaut
        if (results.length === 0) {
            draws.forEach(draw => {
                formattedResults[draw] = {};
                times.forEach(time => {
                    formattedResults[draw][time] = {
                        date: new Date().toISOString(),
                        lot1: Math.floor(Math.random() * 900 + 100).toString(),
                        lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                        lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
                    };
                });
            });
        } else {
            // Utiliser les résultats existants
            results.forEach(result => {
                if (!formattedResults[result.draw]) {
                    formattedResults[result.draw] = {};
                }
                formattedResults[result.draw][result.drawTime] = {
                    date: result.date,
                    lot1: result.lot1,
                    lot2: result.lot2,
                    lot3: result.lot3
                };
            });
        }
        
        res.json({
            success: true,
            results: formattedResults
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des résultats:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Vérifier les tickets gagnants
app.post('/api/check-winners', verifyToken, async (req, res) => {
    try {
        const { draw, drawTime } = req.body;
        
        if (!draw || !drawTime) {
            return res.status(400).json({
                success: false,
                error: 'Paramètres manquants'
            });
        }
        
        // Récupérer les tickets actifs pour ce tirage
        const tickets = await Ticket.find({
            draw: draw,
            drawTime: drawTime,
            status: { $in: ['active', 'printed'] }
        });
        
        // Récupérer les résultats du tirage
        const result = await Result.findOne({
            draw: draw,
            drawTime: drawTime
        }).sort({ date: -1 });
        
        if (!result) {
            return res.json({
                success: true,
                winningTickets: [],
                totalWinnings: 0,
                message: 'Aucun résultat disponible pour ce tirage'
            });
        }
        
        // Vérifier les tickets gagnants
        const winningTickets = [];
        
        for (const ticket of tickets) {
            let isWinner = false;
            let winAmount = 0;
            let winType = '';
            
            // Vérifier chaque pari du ticket
            for (const bet of ticket.bets) {
                // Logique simplifiée de vérification des gains
                // À adapter selon vos règles métier exactes
                if (bet.type === 'borlette' || bet.type === 'boulpe') {
                    // Vérifier contre les 3 lots
                    const lot1Last2 = result.lot1.slice(-2);
                    if (bet.number === lot1Last2) {
                        isWinner = true;
                        winAmount += bet.amount * 60;
                        winType = '1er lot';
                    } else if (bet.number === result.lot2) {
                        isWinner = true;
                        winAmount += bet.amount * 20;
                        winType = '2e lot';
                    } else if (bet.number === result.lot3) {
                        isWinner = true;
                        winAmount += bet.amount * 10;
                        winType = '3e lot';
                    }
                }
                // Ajouter d'autres types de paris ici...
            }
            
            if (isWinner) {
                winningTickets.push({
                    ticketId: ticket._id,
                    ticketNumber: ticket.ticketNumber,
                    agentName: ticket.agentName,
                    totalAmount: ticket.totalAmount,
                    winAmount: winAmount,
                    winType: winType,
                    result: {
                        lot1: result.lot1,
                        lot2: result.lot2,
                        lot3: result.lot3
                    }
                });
                
                // Marquer le ticket comme gagnant
                await Ticket.findByIdAndUpdate(ticket._id, {
                    isWinner: true,
                    winAmount: winAmount,
                    status: 'won',
                    updatedAt: new Date()
                });
            }
        }
        
        res.json({
            success: true,
            winningTickets: winningTickets,
            totalWinnings: winningTickets.reduce((sum, t) => sum + t.winAmount, 0),
            result: {
                draw: result.draw,
                drawTime: result.drawTime,
                lot1: result.lot1,
                lot2: result.lot2,
                lot3: result.lot3
            }
        });
    } catch (error) {
        console.error('Erreur lors de la vérification des gagnants:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Récupérer tous les tickets
app.get('/api/tickets', verifyToken, async (req, res) => {
    try {
        const { limit = 100, skip = 0, status, agentUsername, startDate, endDate } = req.query;
        
        let query = {};
        
        // Filtres optionnels
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (agentUsername) {
            query.agentUsername = agentUsername;
        }
        
        if (startDate || endDate) {
            query.date = {};
            if (startDate) {
                query.date.$gte = new Date(startDate);
            }
            if (endDate) {
                query.date.$lte = new Date(endDate);
            }
        }
        
        const tickets = await Ticket.find(query)
            .sort({ date: -1, ticketNumber: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit));
        
        // Récupérer le prochain numéro de ticket
        const lastTicket = await Ticket.findOne().sort({ ticketNumber: -1 });
        const nextTicketNumber = lastTicket ? lastTicket.ticketNumber + 1 : 1;
        
        // Compter le total
        const total = await Ticket.countDocuments(query);
        
        res.json({
            success: true,
            tickets: tickets,
            nextTicketNumber: nextTicketNumber,
            total: total,
            limit: parseInt(limit),
            skip: parseInt(skip)
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des tickets:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Tickets en attente
app.get('/api/tickets/pending', verifyToken, async (req, res) => {
    try {
        const tickets = await Ticket.find({ 
            status: 'pending',
            syncStatus: { $ne: 'synced' }
        }).sort({ date: -1 });
        
        res.json({
            success: true,
            tickets: tickets
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des tickets en attente:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Tickets gagnants
app.get('/api/tickets/winning', verifyToken, async (req, res) => {
    try {
        const tickets = await Ticket.find({ 
            isWinner: true,
            status: 'won'
        }).sort({ date: -1 });
        
        res.json({
            success: true,
            tickets: tickets
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des tickets gagnants:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Sauvegarder un ticket
app.post('/api/tickets', verifyToken, async (req, res) => {
    try {
        const ticketData = req.body;
        
        // Récupérer les informations de l'utilisateur depuis le token
        let userInfo = null;
        if (req.user && req.user.id) {
            userInfo = await User.findById(req.user.id);
        }
        
        // Générer le numéro de ticket
        const lastTicket = await Ticket.findOne().sort({ ticketNumber: -1 });
        const ticketNumber = lastTicket ? lastTicket.ticketNumber + 1 : 1;
        
        const ticket = new Ticket({
            ticketNumber: ticketNumber,
            date: ticketData.date ? new Date(ticketData.date) : new Date(),
            draw: ticketData.draw,
            drawTime: ticketData.drawTime,
            bets: ticketData.bets || [],
            totalAmount: ticketData.total || ticketData.totalAmount || 0,
            agentName: userInfo ? userInfo.name : ticketData.agentName || 'Agent',
            agentId: userInfo ? userInfo._id : ticketData.agentId,
            agentUsername: userInfo ? userInfo.username : ticketData.agentUsername,
            status: ticketData.status || 'active',
            isMultiDraw: ticketData.isMultiDraw || false,
            draws: ticketData.draws || [],
            createdAt: new Date(),
            updatedAt: new Date(),
            syncStatus: 'pending'
        });
        
        await ticket.save();
        
        // Enregistrer dans l'historique
        await History.create({
            action: 'ticket_created',
            userId: userInfo ? userInfo._id : null,
            userRole: userInfo ? userInfo.role : null,
            username: userInfo ? userInfo.username : null,
            details: {
                ticketNumber: ticket.ticketNumber,
                draw: ticket.draw,
                drawTime: ticket.drawTime,
                totalAmount: ticket.totalAmount,
                betsCount: ticket.bets.length
            },
            ipAddress: req.ip
        });
        
        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                number: ticket.ticketNumber,
                date: ticket.date,
                draw: ticket.draw,
                drawTime: ticket.drawTime,
                total: ticket.totalAmount,
                status: ticket.status
            },
            message: 'Ticket sauvegardé avec succès'
        });
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la sauvegarde'
        });
    }
});

// Sauvegarder un ticket en attente
app.post('/api/tickets/pending', verifyToken, async (req, res) => {
    try {
        const ticketData = req.body;
        
        // Récupérer les informations de l'utilisateur
        let userInfo = null;
        if (req.user && req.user.id) {
            userInfo = await User.findById(req.user.id);
        }
        
        // Générer le numéro de ticket
        const lastTicket = await Ticket.findOne().sort({ ticketNumber: -1 });
        const ticketNumber = lastTicket ? lastTicket.ticketNumber + 1 : 1;
        
        const ticket = new Ticket({
            ticketNumber: ticketNumber,
            date: ticketData.date ? new Date(ticketData.date) : new Date(),
            draw: ticketData.draw,
            drawTime: ticketData.drawTime,
            bets: ticketData.bets || [],
            totalAmount: ticketData.total || ticketData.totalAmount || 0,
            agentName: userInfo ? userInfo.name : ticketData.agentName || 'Agent',
            agentId: userInfo ? userInfo._id : ticketData.agentId,
            agentUsername: userInfo ? userInfo.username : ticketData.agentUsername,
            status: 'pending',
            isMultiDraw: ticketData.isMultiDraw || false,
            draws: ticketData.draws || [],
            createdAt: new Date(),
            updatedAt: new Date(),
            syncStatus: 'pending'
        });
        
        await ticket.save();
        
        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                number: ticket.ticketNumber,
                date: ticket.date,
                draw: ticket.draw,
                drawTime: ticket.drawTime,
                total: ticket.totalAmount,
                status: ticket.status
            },
            message: 'Ticket en attente sauvegardé'
        });
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du ticket en attente:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Mettre à jour le statut d'un ticket
app.put('/api/tickets/:id/status', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, syncStatus } = req.body;
        
        const updateData = {
            updatedAt: new Date()
        };
        
        if (status) {
            updateData.status = status;
            if (status === 'printed') {
                updateData.printedAt = new Date();
            }
        }
        
        if (syncStatus) {
            updateData.syncStatus = syncStatus;
        }
        
        const ticket = await Ticket.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket non trouvé'
            });
        }
        
        res.json({
            success: true,
            ticket: ticket,
            message: 'Statut du ticket mis à jour'
        });
    } catch (error) {
        console.error('Erreur lors de la mise à jour du ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Historique
app.get('/api/history', verifyToken, async (req, res) => {
    try {
        const { limit = 50, action, userId } = req.query;
        
        let query = {};
        
        if (action) {
            query.action = action;
        }
        
        if (userId) {
            query.userId = userId;
        }
        
        const history = await History.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));
        
        res.json({
            success: true,
            history: history,
            total: await History.countDocuments(query)
        });
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'historique:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Sauvegarder l'historique
app.post('/api/history', verifyToken, async (req, res) => {
    try {
        const historyRecord = req.body;
        
        // Récupérer les informations de l'utilisateur
        let userInfo = null;
        if (req.user && req.user.id) {
            userInfo = await User.findById(req.user.id);
        }
        
        const history = new History({
            action: historyRecord.action || 'unknown',
            userId: userInfo ? userInfo._id : historyRecord.userId,
            userRole: userInfo ? userInfo.role : historyRecord.userRole,
            username: userInfo ? userInfo.username : historyRecord.username,
            details: historyRecord.details || {},
            ipAddress: req.ip
        });
        
        await history.save();
        
        res.json({
            success: true,
            message: 'Historique sauvegardé'
        });
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de l\'historique:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Tickets multi-tirages
app.get('/api/tickets/multi-draw', verifyToken, async (req, res) => {
    try {
        const tickets = await Ticket.find({ 
            isMultiDraw: true,
            status: { $in: ['active', 'printed'] }
        }).sort({ date: -1 });
        
        res.json({
            success: true,
            tickets: tickets
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des tickets multi-tirages:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Sauvegarder un ticket multi-tirages
app.post('/api/tickets/multi-draw', verifyToken, async (req, res) => {
    try {
        const ticketData = req.body;
        
        // Récupérer les informations de l'utilisateur
        let userInfo = null;
        if (req.user && req.user.id) {
            userInfo = await User.findById(req.user.id);
        }
        
        // Générer le numéro de ticket
        const lastTicket = await Ticket.findOne().sort({ ticketNumber: -1 });
        const ticketNumber = lastTicket ? lastTicket.ticketNumber + 1 : 1;
        
        const ticket = new Ticket({
            ticketNumber: ticketNumber,
            date: ticketData.date ? new Date(ticketData.date) : new Date(),
            draw: 'multi',
            drawTime: 'multi',
            bets: ticketData.bets || [],
            totalAmount: ticketData.total || ticketData.totalAmount || 0,
            agentName: userInfo ? userInfo.name : ticketData.agentName || 'Agent',
            agentId: userInfo ? userInfo._id : ticketData.agentId,
            agentUsername: userInfo ? userInfo.username : ticketData.agentUsername,
            status: ticketData.status || 'active',
            isMultiDraw: true,
            draws: ticketData.draws || [],
            createdAt: new Date(),
            updatedAt: new Date(),
            syncStatus: 'pending'
        });
        
        await ticket.save();
        
        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                number: ticket.ticketNumber,
                date: ticket.date,
                total: ticket.totalAmount,
                status: ticket.status,
                isMultiDraw: true
            },
            message: 'Ticket multi-tirages sauvegardé'
        });
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du ticket multi-tirages:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Informations de l'entreprise
app.get('/api/company-info', verifyToken, async (req, res) => {
    try {
        let companyInfo = await CompanyInfo.findOne();
        
        if (!companyInfo) {
            companyInfo = await CompanyInfo.create({
                name: 'Nova Lotto',
                phone: '+509 32 53 49 58',
                address: 'Cap Haïtien',
                reportTitle: 'Nova Lotto',
                reportPhone: '40104585',
                logoUrl: '/logo-borlette.jpg'
            });
        }
        
        res.json({
            success: true,
            ...companyInfo.toObject()
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des informations de l\'entreprise:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Logo
app.get('/api/logo', verifyToken, async (req, res) => {
    try {
        const companyInfo = await CompanyInfo.findOne();
        
        res.json({
            success: true,
            logoUrl: companyInfo?.logoUrl || '/logo-borlette.jpg',
            message: 'URL du logo'
        });
    } catch (error) {
        console.error('Erreur lors de la récupération du logo:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Configurations de jeu
app.get('/api/game-configs', verifyToken, async (req, res) => {
    try {
        const configs = await GameConfig.find({ isActive: true });
        
        res.json({
            success: true,
            configs: configs
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des configurations de jeu:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Statistiques des tickets
app.get('/api/tickets/stats', verifyToken, async (req, res) => {
    try {
        const { startDate, endDate, agentUsername } = req.query;
        
        let matchQuery = {};
        
        // Filtres par date
        if (startDate || endDate) {
            matchQuery.date = {};
            if (startDate) {
                matchQuery.date.$gte = new Date(startDate);
            }
            if (endDate) {
                matchQuery.date.$lte = new Date(endDate);
            }
        }
        
        // Filtre par agent
        if (agentUsername) {
            matchQuery.agentUsername = agentUsername;
        }
        
        // Agrégations pour les statistiques
        const stats = await Ticket.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalTickets: { $sum: 1 },
                    totalAmount: { $sum: "$totalAmount" },
                    activeTickets: {
                        $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
                    },
                    pendingTickets: {
                        $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
                    },
                    printedTickets: {
                        $sum: { $cond: [{ $eq: ["$status", "printed"] }, 1, 0] }
                    },
                    winningTickets: {
                        $sum: { $cond: ["$isWinner", 1, 0] }
                    },
                    totalWinnings: { $sum: "$winAmount" }
                }
            }
        ]);
        
        // Statistiques par jour (derniers 7 jours)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const dailyStats = await Ticket.aggregate([
            {
                $match: {
                    date: { $gte: sevenDaysAgo },
                    ...matchQuery
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$date" }
                    },
                    ticketsCount: { $sum: 1 },
                    totalAmount: { $sum: "$totalAmount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        res.json({
            success: true,
            stats: stats[0] || {
                totalTickets: 0,
                totalAmount: 0,
                activeTickets: 0,
                pendingTickets: 0,
                printedTickets: 0,
                winningTickets: 0,
                totalWinnings: 0
            },
            dailyStats: dailyStats
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des statistiques:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Rechercher un ticket par numéro
app.get('/api/tickets/search/:number', verifyToken, async (req, res) => {
    try {
        const { number } = req.params;
        
        const ticket = await Ticket.findOne({ ticketNumber: parseInt(number) });
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket non trouvé'
            });
        }
        
        res.json({
            success: true,
            ticket: ticket
        });
    } catch (error) {
        console.error('Erreur lors de la recherche du ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// === ROUTES STATIQUES ===

// Servir les fichiers statiques
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Route racine (page de connexion)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route Lotato
app.get('/lotato.html', (req, res) => {
    // Vérification basique du token depuis l'URL
    const token = req.query.token;
    
    if (!token || !token.startsWith('nova_')) {
        // Rediriger vers la page de connexion si pas de token valide
        return res.redirect('/');
    }
    
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Route pour les autres pages HTML
app.get('/*.html', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    
    // Vérifier si le fichier existe
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.status(404).send('Page non trouvée');
        }
        
        res.sendFile(filePath);
    });
});

// Route pour le service worker
app.get('/service-worker.js', (req, res) => {
    const serviceWorkerPath = path.join(__dirname, 'service-worker.js');
    
    fs.access(serviceWorkerPath, fs.constants.F_OK, (err) => {
        if (err) {
            // Créer un service worker basique s'il n'existe pas
            const basicSW = `
                self.addEventListener('install', event => {
                    console.log('Service Worker installé');
                });
                
                self.addEventListener('fetch', event => {
                    event.respondWith(fetch(event.request));
                });
            `;
            
            return res.type('application/javascript').send(basicSW);
        }
        
        res.sendFile(serviceWorkerPath);
    });
});

// Route pour les images (logo)
app.get('/logo-borlette.jpg', (req, res) => {
    const logoPath = path.join(__dirname, 'logo-borlette.jpg');
    
    fs.access(logoPath, fs.constants.F_OK, (err) => {
        if (err) {
            // Retourner une image par défaut si le logo n'existe pas
            return res.redirect('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YzOWMxMiIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+Qk9STEVUVEU8L3RleHQ+PC9zdmc+');
        }
        
        res.sendFile(logoPath);
    });
});

// Route pour le manifest
app.get('/manifest.json', (req, res) => {
    const manifest = {
        "name": "Lotato",
        "short_name": "Lotato",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0f172a",
        "theme_color": "#0f172a",
        "icons": [
            {
                "src": "/logo-borlette.jpg",
                "sizes": "192x192",
                "type": "image/jpeg"
            }
        ]
    };
    
    res.json(manifest);
});

// === GESTION D'ERREURS ===

// Middleware 404 pour les routes API non trouvées
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route API non trouvée'
    });
});

// Middleware 404 général
app.use((req, res) => {
    res.status(404).send('Page non trouvée');
});

// Middleware d'erreur
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({
            success: false,
            error: 'Erreur serveur interne'
        });
    }
    
    res.status(500).send('Erreur serveur interne');
});

// === DÉMARRAGE DU SERVEUR ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur Lotato démarré sur le port ${PORT}`);
    console.log(`📁 Compression GZIP activée`);
    console.log(`🗄️  MongoDB: ${mongoURI}`);
    console.log(`🏠 Page de connexion: http://localhost:${PORT}/`);
    console.log(`🎰 Application Lotato: http://localhost:${PORT}/lotato.html`);
    console.log('');
    console.log('✅ Serveur Lotato avec MongoDB existant prêt !');
    console.log('');
    console.log('📋 Routes API disponibles:');
    console.log('  POST /api/auth/login');
    console.log('  GET  /api/health');
    console.log('  GET  /api/results');
    console.log('  POST /api/check-winners');
    console.log('  GET  /api/tickets');
    console.log('  POST /api/tickets');
    console.log('  PUT  /api/tickets/:id/status');
    console.log('  GET  /api/tickets/pending');
    console.log('  POST /api/tickets/pending');
    console.log('  GET  /api/tickets/winning');
    console.log('  GET  /api/tickets/multi-draw');
    console.log('  POST /api/tickets/multi-draw');
    console.log('  GET  /api/tickets/search/:number');
    console.log('  GET  /api/tickets/stats');
    console.log('  GET  /api/history');
    console.log('  POST /api/history');
    console.log('  GET  /api/company-info');
    console.log('  GET  /api/logo');
    console.log('  GET  /api/game-configs');
});