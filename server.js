const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const cors = require('cors');

const app = express();

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

// Middleware CORS - Configuration production
app.use(cors({
    origin: function(origin, callback) {
        // Autoriser toutes les origines en développement
        if (!origin || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        // En production, autoriser les domaines spécifiques
        const allowedOrigins = [
            'http://localhost:10000',
            'http://localhost:3000',
            'https://novalotto.com',
            'https://www.novalotto.com',
            'https://master.novalotto.com'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

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

// Connexion MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/novalotto';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
}).catch(err => {
    console.error('❌ Erreur de connexion MongoDB:', err);
    process.exit(1);
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Erreur MongoDB:'));
db.once('open', () => {
    console.log('✅ MongoDB connecté avec succès !');
});

// =================== SCHÉMAS ===================

// Schema utilisateur simple
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String },
    role: {
        type: String,
        enum: ['master', 'subsystem', 'supervisor', 'agent'],
        required: true
    },
    level: { type: Number, default: 1 },
    subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
    is_active: { type: Boolean, default: true },
    last_login: { type: Date },
    created_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Schéma pour les tirages
const drawSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    icon: { type: String, default: 'fas fa-dice' },
    times: {
        morning: { type: String, required: true },
        evening: { type: String, required: true }
    },
    is_active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

const Draw = mongoose.model('Draw', drawSchema);

// Schéma pour les résultats
const resultSchema = new mongoose.Schema({
    draw: { type: String, required: true },
    draw_time: { type: String, enum: ['morning', 'evening'], required: true },
    date: { type: Date, required: true },
    lot1: { type: String, required: true },
    lot2: { type: String },
    lot3: { type: String },
    verified: { type: Boolean, default: false },
    verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verified_at: { type: Date }
});

const Result = mongoose.model('Result', resultSchema);

// Schéma pour les paris
const betSchema = new mongoose.Schema({
    type: { type: String, required: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    options: { type: mongoose.Schema.Types.Mixed },
    perOptionAmount: { type: Number },
    isLotto4: { type: Boolean, default: false },
    isLotto5: { type: Boolean, default: false },
    isAuto: { type: Boolean, default: false },
    isGroup: { type: Boolean, default: false },
    details: { type: mongoose.Schema.Types.Mixed }
});

// Schéma pour les fiches
const ticketSchema = new mongoose.Schema({
    number: { type: Number, required: true },
    subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
    draw: { type: String, required: true },
    draw_time: { type: String, enum: ['morning', 'evening'], required: true },
    date: { type: Date, default: Date.now },
    bets: [betSchema],
    total: { type: Number, required: true },
    agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    agent_name: { type: String, required: true },
    is_printed: { type: Boolean, default: false },
    printed_at: { type: Date },
    is_synced: { type: Boolean, default: false },
    synced_at: { type: Date },
    created_at: { type: Date, default: Date.now }
});

// Index pour recherche rapide
ticketSchema.index({ subsystem_id: 1, number: 1 }, { unique: true });
ticketSchema.index({ date: -1 });
ticketSchema.index({ draw: 1, draw_time: 1 });

const Ticket = mongoose.model('Ticket', ticketSchema);

// Schéma pour les sous-systèmes
const subsystemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    contact_email: { type: String, required: true },
    contact_phone: { type: String },
    address: { type: String },
    is_active: { type: Boolean, default: true },
    master_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now }
});

const Subsystem = mongoose.model('Subsystem', subsystemSchema);

// Schéma pour la configuration
const configSchema = new mongoose.Schema({
    subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
    company_name: { type: String, default: 'Nova Lotto' },
    company_phone: { type: String, default: '+509 32 53 49 58' },
    company_address: { type: String, default: 'Cap Haïtien' },
    report_title: { type: String, default: 'Nova Lotto' },
    report_phone: { type: String, default: '40104585' },
    logo_url: { type: String, default: 'logo-borlette.jpg' },
    created_at: { type: Date, default: Date.now }
});

const Config = mongoose.model('Config', configSchema);

// =================== MIDDLEWARE D'AUTHENTIFICATION ===================

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'] || req.query.token;
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Token manquant'
        });
    }
    
    // Décoder le token simple (format: nova_TIMESTAMP_USERID_ROLE_LEVEL)
    try {
        const tokenParts = token.replace('Bearer ', '').split('_');
        
        if (tokenParts.length < 5) {
            return res.status(401).json({
                success: false,
                error: 'Token invalide'
            });
        }
        
        req.user = {
            id: tokenParts[2],
            role: tokenParts[3],
            level: parseInt(tokenParts[4]) || 1
        };
        
        next();
    } catch (error) {
        console.error('Erreur vérification token:', error);
        res.status(401).json({
            success: false,
            error: 'Token invalide'
        });
    }
};

// =================== ROUTES D'AUTHENTIFICATION ===================

// Route de connexion pour LOTATO
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role = 'agent' } = req.body;
        
        console.log('Tentative de connexion LOTATO:', { username, role });
        
        // Rechercher l'utilisateur
        const user = await User.findOne({ 
            username: username,
            password: password,
            role: role,
            is_active: true
        });

        if (!user) {
            console.log('Utilisateur non trouvé ou informations incorrectes');
            return res.status(401).json({
                success: false,
                error: 'Identifiant ou mot de passe incorrect'
            });
        }

        console.log('Utilisateur trouvé:', user.username, user.role);

        // Mettre à jour la dernière connexion
        user.last_login = new Date();
        await user.save();

        // Générer un token simple
        const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;

        res.json({
            success: true,
            token: token,
            admin: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level,
                subsystem_id: user.subsystem_id
            }
        });

    } catch (error) {
        console.error('Erreur login LOTATO:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la connexion'
        });
    }
});

// Route de vérification de session
app.get('/api/auth/check', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                error: 'Session expirée'
            });
        }
        
        res.json({
            success: true,
            admin: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level,
                subsystem_id: user.subsystem_id
            }
        });
    } catch (error) {
        console.error('Erreur vérification session:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// =================== ROUTES DE SANTÉ ===================

app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'online', 
        timestamp: new Date().toISOString(),
        database: db.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// =================== ROUTES POUR LOTATO ===================

// Route pour obtenir les tirages disponibles
app.get('/api/draws', verifyToken, async (req, res) => {
    try {
        const draws = await Draw.find({ is_active: true }).sort({ order: 1 });
        
        const formattedDraws = {};
        draws.forEach(draw => {
            formattedDraws[draw.code] = {
                name: draw.name,
                icon: draw.icon,
                times: draw.times,
                countdown: '-- h -- min'
            };
        });
        
        // Ajouter les tirages par défaut si la base est vide
        if (Object.keys(formattedDraws).length === 0) {
            formattedDraws['miami'] = {
                name: 'Miami',
                icon: 'fas fa-sun',
                times: { morning: '1:30 PM', evening: '9:50 PM' },
                countdown: '-- h -- min'
            };
            formattedDraws['georgia'] = {
                name: 'Georgia',
                icon: 'fas fa-map-marker-alt',
                times: { morning: '12:30 PM', evening: '7:00 PM' },
                countdown: '-- h -- min'
            };
            formattedDraws['newyork'] = {
                name: 'New York',
                icon: 'fas fa-building',
                times: { morning: '2:30 PM', evening: '8:00 PM' },
                countdown: '-- h -- min'
            };
            formattedDraws['texas'] = {
                name: 'Texas',
                icon: 'fas fa-hat-cowboy',
                times: { morning: '12:00 PM', evening: '6:00 PM' },
                countdown: '-- h -- min'
            };
            formattedDraws['tunisia'] = {
                name: 'Tunisie',
                icon: 'fas fa-flag',
                times: { morning: '10:30 AM', evening: '2:00 PM' },
                countdown: '-- h -- min'
            };
        }
        
        res.json({
            success: true,
            draws: formattedDraws
        });
    } catch (error) {
        console.error('Erreur chargement tirages:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des tirages'
        });
    }
});

// Route pour les résultats
app.get('/api/results', verifyToken, async (req, res) => {
    try {
        const { draw, draw_time, date } = req.query;
        
        let query = {};
        if (draw) query.draw = draw;
        if (draw_time) query.draw_time = draw_time;
        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
            query.date = { $gte: startDate, $lt: endDate };
        }
        
        const results = await Result.find(query)
            .sort({ date: -1 })
            .limit(50);
        
        // Format pour LOTATO
        const formattedResults = {};
        results.forEach(result => {
            if (!formattedResults[result.draw]) {
                formattedResults[result.draw] = {};
            }
            formattedResults[result.draw][result.draw_time] = {
                date: result.date,
                lot1: result.lot1,
                lot2: result.lot2 || '',
                lot3: result.lot3 || ''
            };
        });
        
        res.json({
            success: true,
            results: formattedResults
        });
    } catch (error) {
        console.error('Erreur chargement résultats:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des résultats'
        });
    }
});

// Route pour les derniers résultats
app.get('/api/results/latest', verifyToken, async (req, res) => {
    try {
        const draws = await Draw.find({ is_active: true });
        
        const latestResults = {};
        
        for (const draw of draws) {
            const latestResult = await Result.findOne({ 
                draw: draw.code 
            }).sort({ date: -1 });
            
            if (latestResult) {
                latestResults[draw.code] = {
                    morning: latestResult.draw_time === 'morning' ? {
                        date: latestResult.date,
                        lot1: latestResult.lot1,
                        lot2: latestResult.lot2 || '',
                        lot3: latestResult.lot3 || ''
                    } : null,
                    evening: latestResult.draw_time === 'evening' ? {
                        date: latestResult.date,
                        lot1: latestResult.lot1,
                        lot2: latestResult.lot2 || '',
                        lot3: latestResult.lot3 || ''
                    } : null
                };
            }
        }
        
        res.json({
            success: true,
            results: latestResults
        });
    } catch (error) {
        console.error('Erreur chargement derniers résultats:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des derniers résultats'
        });
    }
});

// Route pour sauvegarder une fiche
app.post('/api/tickets', verifyToken, async (req, res) => {
    try {
        const { draw, draw_time, bets, agentId, agentName, subsystem_id } = req.body;
        
        // Obtenir le dernier numéro de ticket pour ce sous-système
        const lastTicket = await Ticket.findOne({ subsystem_id: subsystem_id })
            .sort({ number: -1 });
        
        const ticketNumber = lastTicket ? lastTicket.number + 1 : 1;
        
        // Calculer le total
        const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
        
        // Créer la fiche
        const ticket = new Ticket({
            number: ticketNumber,
            subsystem_id: subsystem_id,
            draw: draw,
            draw_time: draw_time,
            bets: bets,
            total: total,
            agent_id: agentId,
            agent_name: agentName,
            date: new Date(),
            created_at: new Date()
        });
        
        await ticket.save();
        
        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                number: ticket.number,
                date: ticket.date,
                draw: ticket.draw,
                draw_time: ticket.draw_time,
                bets: ticket.bets,
                total: ticket.total,
                agent_name: ticket.agent_name
            }
        });
    } catch (error) {
        console.error('Erreur sauvegarde fiche:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la sauvegarde de la fiche'
        });
    }
});

// Route pour obtenir une fiche par ID
app.get('/api/tickets/:id', verifyToken, async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Fiche non trouvée'
            });
        }
        
        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                number: ticket.number,
                date: ticket.date,
                draw: ticket.draw,
                draw_time: ticket.draw_time,
                bets: ticket.bets,
                total: ticket.total,
                agent_name: ticket.agent_name
            }
        });
    } catch (error) {
        console.error('Erreur récupération fiche:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération de la fiche'
        });
    }
});

// Route pour rechercher une fiche
app.get('/api/tickets/search', verifyToken, async (req, res) => {
    try {
        const { number, subsystem_id } = req.query;
        
        if (!number || !subsystem_id) {
            return res.status(400).json({
                success: false,
                error: 'Numéro de fiche et sous-système requis'
            });
        }
        
        const ticket = await Ticket.findOne({
            number: parseInt(number),
            subsystem_id: subsystem_id
        });
        
        if (!ticket) {
            return res.json({
                success: false,
                error: 'Fiche non trouvée'
            });
        }
        
        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                number: ticket.number,
                date: ticket.date,
                draw: ticket.draw,
                draw_time: ticket.draw_time,
                bets: ticket.bets,
                total: ticket.total,
                agent_name: ticket.agent_name
            }
        });
    } catch (error) {
        console.error('Erreur recherche fiche:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la recherche de la fiche'
        });
    }
});

// Route pour l'historique des fiches
app.get('/api/tickets/history', verifyToken, async (req, res) => {
    try {
        const { subsystem_id, page = 1, limit = 20, start_date, end_date } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let query = {};
        if (subsystem_id) {
            query.subsystem_id = subsystem_id;
        }
        
        // Filtre par date
        if (start_date && end_date) {
            const start = new Date(start_date);
            const end = new Date(end_date);
            end.setDate(end.getDate() + 1);
            query.date = { $gte: start, $lt: end };
        }
        
        const tickets = await Ticket.find(query)
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ date: -1 });
        
        const total = await Ticket.countDocuments(query);
        
        res.json({
            success: true,
            tickets: tickets.map(ticket => ({
                id: ticket._id,
                number: ticket.number,
                date: ticket.date,
                draw: ticket.draw,
                draw_time: ticket.draw_time,
                bets: ticket.bets,
                total: ticket.total,
                agent_name: ticket.agent_name
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                total_pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Erreur historique fiches:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement de l\'historique'
        });
    }
});

// Route pour toutes les fiches (limitée)
app.get('/api/tickets/all', verifyToken, async (req, res) => {
    try {
        const { subsystem_id } = req.query;
        
        let query = {};
        if (subsystem_id) {
            query.subsystem_id = subsystem_id;
        }
        
        const tickets = await Ticket.find(query)
            .sort({ date: -1 })
            .limit(100);
        
        res.json({
            success: true,
            tickets: tickets.map(ticket => ({
                id: ticket._id,
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
        console.error('Erreur toutes les fiches:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des fiches'
        });
    }
});

// Route pour les fiches en attente de synchronisation
app.get('/api/tickets/pending', verifyToken, async (req, res) => {
    try {
        const { subsystem_id } = req.query;
        
        let query = { is_synced: false };
        if (subsystem_id) {
            query.subsystem_id = subsystem_id;
        }
        
        const tickets = await Ticket.find(query)
            .sort({ date: -1 })
            .limit(50);
        
        res.json({
            success: true,
            tickets: tickets.map(ticket => ({
                id: ticket._id,
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

// Route pour les informations de l'entreprise
app.get('/api/company/info', verifyToken, async (req, res) => {
    try {
        const { subsystem_id } = req.query;
        
        let query = {};
        if (subsystem_id) {
            query.subsystem_id = subsystem_id;
        }
        
        const config = await Config.findOne(query);
        
        if (!config) {
            // Retourner les valeurs par défaut
            return res.json({
                success: true,
                name: 'Nova Lotto',
                phone: '+509 32 53 49 58',
                address: 'Cap Haïtien',
                reportTitle: 'Nova Lotto',
                reportPhone: '40104585'
            });
        }
        
        res.json({
            success: true,
            name: config.company_name,
            phone: config.company_phone,
            address: config.company_address,
            reportTitle: config.report_title,
            reportPhone: config.report_phone
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
app.get('/api/company/logo', verifyToken, async (req, res) => {
    try {
        const { subsystem_id } = req.query;
        
        let query = {};
        if (subsystem_id) {
            query.subsystem_id = subsystem_id;
        }
        
        const config = await Config.findOne(query);
        
        if (!config || !config.logo_url) {
            return res.json({
                success: true,
                logoUrl: 'logo-borlette.jpg'
            });
        }
        
        res.json({
            success: true,
            logoUrl: config.logo_url
        });
    } catch (error) {
        console.error('Erreur chargement logo:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement du logo'
        });
    }
});

// Route pour vérifier les gagnants
app.post('/api/tickets/check-winners', verifyToken, async (req, res) => {
    try {
        const { draw, draw_time, subsystem_id } = req.body;
        
        // Récupérer le résultat du tirage
        const result = await Result.findOne({ 
            draw: draw,
            draw_time: draw_time 
        }).sort({ date: -1 });
        
        if (!result) {
            return res.json({
                success: true,
                winningTickets: [],
                message: 'Aucun résultat trouvé pour ce tirage'
            });
        }
        
        // Récupérer les tickets pour ce tirage
        const tickets = await Ticket.find({
            draw: draw,
            draw_time: draw_time,
            subsystem_id: subsystem_id
        });
        
        const winningTickets = [];
        
        // Vérifier chaque ticket (logique simplifiée)
        for (const ticket of tickets) {
            const winningBets = [];
            
            for (const bet of ticket.bets) {
                let winAmount = 0;
                let winType = '';
                let matchedNumber = '';
                
                // Logique de vérification des gains
                if (bet.type === 'borlette' || bet.type === 'boulpe') {
                    if (bet.number === result.lot1.substring(1, 3)) {
                        winAmount = bet.amount * 60;
                        winType = '1er lot';
                        matchedNumber = result.lot1.substring(1, 3);
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
                    if (bet.number === result.lot1.substring(0, 3)) {
                        winAmount = bet.amount * 500;
                        winType = 'Lotto 3';
                        matchedNumber = result.lot1.substring(0, 3);
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
                
                winningTickets.push({
                    id: ticket._id,
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

// Route pour les fiches gagnantes
app.get('/api/tickets/winning', verifyToken, async (req, res) => {
    try {
        const { subsystem_id } = req.query;
        
        // Cette route devrait interroger une collection de gagnants
        // Pour l'instant, retourner un tableau vide
        res.json({
            success: true,
            tickets: []
        });
    } catch (error) {
        console.error('Erreur chargement gagnants:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des gagnants'
        });
    }
});

// =================== ROUTES D'ADMINISTRATION ===================

// Route pour créer un utilisateur
app.post('/api/users', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'master' && req.user.role !== 'subsystem') {
            return res.status(403).json({
                success: false,
                error: 'Accès non autorisé'
            });
        }
        
        const { username, password, name, role, level = 1, subsystem_id } = req.body;
        
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Cet utilisateur existe déjà'
            });
        }
        
        const user = new User({
            username,
            password,
            name,
            role,
            level,
            subsystem_id: req.user.role === 'subsystem' ? req.user.id : subsystem_id,
            created_at: new Date()
        });
        
        await user.save();
        
        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level,
                created_at: user.created_at
            }
        });
    } catch (error) {
        console.error('Erreur création utilisateur:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la création de l\'utilisateur'
        });
    }
});

// =================== ROUTES HTML ===================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/lotato.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

app.get('/master-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

app.get('/subsystem-admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
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

// =================== MIDDLEWARE DE GESTION D'ERREURS ===================

app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err.stack);
    
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({
            success: false,
            error: 'Erreur serveur interne'
        });
    }
    
    res.status(500).send('Erreur serveur interne');
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
    console.log(`🌐 CORS configuré pour la production`);
    console.log(`🎰 LOTATO: http://localhost:${PORT}/lotato.html`);
    console.log(`👑 Master Dashboard: http://localhost:${PORT}/master-dashboard.html`);
    console.log(`🏢 Subsystem Admin: http://localhost:${PORT}/subsystem-admin.html`);
    console.log(`🏠 Login: http://localhost:${PORT}/`);
    console.log('');
    console.log('✅ Serveur prêt !');
    console.log('');
    console.log('📋 Routes API LOTATO disponibles:');
    console.log('  POST   /api/auth/login');
    console.log('  GET    /api/auth/check');
    console.log('  GET    /api/draws');
    console.log('  GET    /api/results');
    console.log('  GET    /api/results/latest');
    console.log('  POST   /api/tickets');
    console.log('  GET    /api/tickets/:id');
    console.log('  GET    /api/tickets/search');
    console.log('  GET    /api/tickets/history');
    console.log('  GET    /api/tickets/all');
    console.log('  GET    /api/tickets/pending');
    console.log('  POST   /api/tickets/check-winners');
    console.log('  GET    /api/tickets/winning');
    console.log('  GET    /api/company/info');
    console.log('  GET    /api/company/logo');
    console.log('  POST   /api/users');
});