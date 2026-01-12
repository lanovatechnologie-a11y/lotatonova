const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// === CONFIGURATION MIDDLEWARE ===
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Servir les fichiers statiques

// === CONNEXION MONGODB ATLAS ===
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://votre-utilisateur:votre-motdepasse@cluster0.mongodb.net/nova?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Erreur de connexion MongoDB:'));
db.once('open', () => {
    console.log('✅ Connecté à MongoDB Atlas');
    initializeDatabase();
});

// === SCHÉMAS MONGOOSE ===

// Schéma Utilisateur
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: {
        type: String,
        enum: ['agent', 'supervisor1', 'supervisor2', 'subsystem', 'master'],
        required: true
    },
    level: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    dateCreation: { type: Date, default: Date.now }
});

// Schéma Tirage
const drawSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    icon: { type: String, default: 'fas fa-dice' },
    times: {
        morning: { type: String, required: true },
        evening: { type: String, required: true }
    },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// Schéma Résultat
const resultSchema = new mongoose.Schema({
    drawCode: { type: String, required: true },
    drawTime: { 
        type: String, 
        enum: ['morning', 'evening'], 
        required: true 
    },
    date: { type: Date, required: true },
    lot1: { type: String, required: true },  // 3 chiffres
    lot2: { type: String, required: true },  // 2 chiffres
    lot3: { type: String, required: true },  // 2 chiffres
    verified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date }
});

// Schéma Pari (utilisé dans Ticket)
const betSchema = new mongoose.Schema({
    type: { type: String, required: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    options: {
        option1: Boolean,
        option2: Boolean,
        option3: Boolean
    },
    perOptionAmount: Number,
    isLotto4: { type: Boolean, default: false },
    isLotto5: { type: Boolean, default: false },
    isAuto: { type: Boolean, default: false },
    isGroup: { type: Boolean, default: false },
    details: mongoose.Schema.Types.Mixed
});

// Schéma Ticket
const ticketSchema = new mongoose.Schema({
    number: { type: Number, required: true },
    draw: { type: String, required: true },
    drawTime: { 
        type: String, 
        enum: ['morning', 'evening'], 
        required: true 
    },
    date: { type: Date, default: Date.now },
    bets: [betSchema],
    total: { type: Number, required: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    agentName: { type: String, required: true },
    isPrinted: { type: Boolean, default: false },
    printedAt: { type: Date },
    isSynced: { type: Boolean, default: false },
    syncedAt: { type: Date }
});

// Schéma Ticket Multi-Tirage
const multiDrawTicketSchema = new mongoose.Schema({
    number: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    bets: [{
        gameType: { type: String, required: true },
        name: { type: String, required: true },
        number: { type: String, required: true },
        amount: { type: Number, required: true },
        multiplier: { type: Number, required: true },
        draws: [{ type: String }],
        options: mongoose.Schema.Types.Mixed
    }],
    draws: [{ type: String }],
    total: { type: Number, required: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    agentName: { type: String, required: true },
    isPrinted: { type: Boolean, default: false },
    printedAt: { type: Date }
});

// Schéma Gagnant
const winnerSchema = new mongoose.Schema({
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
    ticketNumber: { type: Number, required: true },
    draw: { type: String, required: true },
    drawTime: { 
        type: String, 
        enum: ['morning', 'evening'], 
        required: true 
    },
    date: { type: Date, default: Date.now },
    winningBets: [{
        type: { type: String },
        name: { type: String },
        number: { type: String },
        matchedNumber: { type: String },
        winType: { type: String },
        winAmount: { type: Number }
    }],
    totalWinnings: { type: Number, required: true },
    paid: { type: Boolean, default: false },
    paidAt: { type: Date },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Schéma Configuration
const configSchema = new mongoose.Schema({
    companyName: { type: String, default: 'Nova Lotto' },
    companyPhone: { type: String, default: '+509 32 53 49 58' },
    companyAddress: { type: String, default: 'Cap Haïtien' },
    reportTitle: { type: String, default: 'Nova Lotto' },
    reportPhone: { type: String, default: '40104585' },
    logoUrl: { type: String, default: 'logo-borlette.jpg' }
});

// === MODÈLES ===
const User = mongoose.model('User', userSchema);
const Draw = mongoose.model('Draw', drawSchema);
const Result = mongoose.model('Result', resultSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const MultiDrawTicket = mongoose.model('MultiDrawTicket', multiDrawTicketSchema);
const Winner = mongoose.model('Winner', winnerSchema);
const Config = mongoose.model('Config', configSchema);

// === INITIALISATION BASE DE DONNÉES ===
async function initializeDatabase() {
    try {
        // Vérifier si la base contient déjà des données
        const userCount = await User.countDocuments();
        const drawCount = await Draw.countDocuments();
        const configCount = await Config.countDocuments();

        // Créer utilisateur master si aucun utilisateur
        if (userCount === 0) {
            const masterUser = new User({
                username: 'master',
                password: 'master123',
                name: 'Administrateur Master',
                role: 'master',
                level: 1
            });
            await masterUser.save();
            console.log('✅ Utilisateur master créé');
        }

        // Créer les tirages si aucun
        if (drawCount === 0) {
            const draws = [
                { code: 'miami', name: 'Miami', icon: 'fas fa-sun', 
                  times: { morning: '1:30 PM', evening: '9:50 PM' }, order: 1 },
                { code: 'georgia', name: 'Georgia', icon: 'fas fa-map-marker-alt', 
                  times: { morning: '12:30 PM', evening: '7:00 PM' }, order: 2 },
                { code: 'newyork', name: 'New York', icon: 'fas fa-building', 
                  times: { morning: '2:30 PM', evening: '8:00 PM' }, order: 3 },
                { code: 'texas', name: 'Texas', icon: 'fas fa-hat-cowboy', 
                  times: { morning: '12:00 PM', evening: '6:00 PM' }, order: 4 },
                { code: 'tunisia', name: 'Tunisie', icon: 'fas fa-flag', 
                  times: { morning: '10:30 AM', evening: '2:00 PM' }, order: 5 }
            ];
            await Draw.insertMany(draws);
            console.log('✅ Tirages créés');
        }

        // Créer configuration si aucune
        if (configCount === 0) {
            const config = new Config();
            await config.save();
            console.log('✅ Configuration créée');
        }

        // Créer quelques résultats de test
        const resultCount = await Result.countDocuments();
        if (resultCount === 0) {
            const today = new Date();
            const draws = await Draw.find();
            
            for (const draw of draws) {
                for (const time of ['morning', 'evening']) {
                    const result = new Result({
                        drawCode: draw.code,
                        drawTime: time,
                        date: today,
                        lot1: Math.floor(Math.random() * 900 + 100).toString(),
                        lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                        lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
                    });
                    await result.save();
                }
            }
            console.log('✅ Résultats de test créés');
        }

    } catch (error) {
        console.error('❌ Erreur initialisation base de données:', error);
    }
}

// === MIDDLEWARE AUTHENTIFICATION ===
function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1] || 
                  req.query.token || 
                  req.body.token;
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Token manquant' 
        });
    }
    
    // Vérifier le token (simplifié - remplacer par JWT en production)
    try {
        // Pour le moment, accepter tout token non vide
        if (token && token.trim() !== '') {
            req.userToken = token;
            next();
        } else {
            return res.status(401).json({ 
                success: false, 
                error: 'Token invalide' 
            });
        }
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            error: 'Token invalide' 
        });
    }
}

// === ROUTES API ===

// 1. ROUTES AUTHENTIFICATION
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        console.log('Tentative connexion:', { username, role });
        
        const user = await User.findOne({ 
            username: username.trim().toLowerCase(),
            role: role
        });
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }
        
        // Vérifier mot de passe (simplifié - remplacer par bcrypt en production)
        if (user.password !== password) {
            return res.status(401).json({
                success: false,
                error: 'Mot de passe incorrect'
            });
        }
        
        // Générer token (simplifié)
        const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level}`;
        
        // Déterminer la page de redirection
        let redirectUrl;
        if (role === 'agent') {
            redirectUrl = '/lotato.html';
        } else if (role.startsWith('supervisor')) {
            redirectUrl = `/control-${role}.html`;
        } else if (role === 'subsystem') {
            redirectUrl = '/subsystem-admin.html';
        } else if (role === 'master') {
            redirectUrl = '/master-dashboard.html';
        } else {
            redirectUrl = '/index.html';
        }
        
        redirectUrl += `?token=${encodeURIComponent(token)}`;
        
        res.json({
            success: true,
            redirectUrl: redirectUrl,
            token: token,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level
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

app.get('/api/auth/verify', async (req, res) => {
    try {
        const token = req.query.token;
        
        if (!token) {
            return res.json({
                success: false,
                valid: false
            });
        }
        
        // Accepter tout token non vide pour le moment
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

// 2. ROUTES TIAGES
app.get('/api/draws', async (req, res) => {
    try {
        const draws = await Draw.find({ isActive: true }).sort({ order: 1 });
        
        const drawsObject = {};
        draws.forEach(draw => {
            drawsObject[draw.code] = {
                name: draw.name,
                icon: draw.icon,
                times: draw.times,
                countdown: '-- h -- min'
            };
        });
        
        res.json({
            success: true,
            draws: drawsObject
        });
    } catch (error) {
        console.error('Erreur chargement tirages:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des tirages'
        });
    }
});

// 3. ROUTES RÉSULTATS
app.get('/api/results', async (req, res) => {
    try {
        const { draw, draw_time } = req.query;
        
        let query = {};
        if (draw) query.drawCode = draw;
        if (draw_time) query.drawTime = draw_time;
        
        // Obtenir les résultats des dernières 24h
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        query.date = { $gte: yesterday };
        
        const results = await Result.find(query)
            .sort({ date: -1 })
            .limit(50);
        
        res.json({
            success: true,
            results: results
        });
    } catch (error) {
        console.error('Erreur chargement résultats:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des résultats'
        });
    }
});

app.get('/api/results/latest', async (req, res) => {
    try {
        const draws = await Draw.find({ isActive: true });
        const latestResults = {};
        
        for (const draw of draws) {
            const latestResult = await Result.findOne({ 
                drawCode: draw.code 
            }).sort({ date: -1 });
            
            if (latestResult) {
                latestResults[draw.code] = {
                    draw: latestResult.drawCode,
                    draw_time: latestResult.drawTime,
                    date: latestResult.date,
                    lot1: latestResult.lot1,
                    lot2: latestResult.lot2,
                    lot3: latestResult.lot3,
                    verified: latestResult.verified
                };
            }
        }
        
        res.json({
            success: true,
            results: latestResults
        });
    } catch (error) {
        console.error('Erreur derniers résultats:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des derniers résultats'
        });
    }
});

// 4. ROUTES TICKETS
app.get('/api/tickets', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const tickets = await Ticket.find()
            .skip(skip)
            .limit(limit)
            .sort({ date: -1 });
        
        const total = await Ticket.countDocuments();
        
        res.json({
            success: true,
            tickets: tickets,
            nextTicketNumber: total > 0 ? tickets[0].number + 1 : 100001,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Erreur chargement tickets:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des tickets'
        });
    }
});

app.post('/api/tickets', authenticateToken, async (req, res) => {
    try {
        const { draw, drawTime, bets, agentName } = req.body;
        
        // Trouver le prochain numéro de ticket
        const lastTicket = await Ticket.findOne().sort({ number: -1 });
        const ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;
        
        // Calculer le total
        const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
        
        const ticket = new Ticket({
            number: ticketNumber,
            draw: draw,
            drawTime: drawTime,
            bets: bets,
            total: total,
            agentName: agentName,
            date: new Date()
        });
        
        await ticket.save();
        
        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                number: ticket.number,
                date: ticket.date,
                draw: ticket.draw,
                drawTime: ticket.drawTime,
                bets: ticket.bets,
                total: ticket.total,
                agentName: ticket.agentName
            }
        });
    } catch (error) {
        console.error('Erreur sauvegarde ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la sauvegarde du ticket'
        });
    }
});

app.get('/api/tickets/pending', authenticateToken, async (req, res) => {
    try {
        const tickets = await Ticket.find({ isSynced: false })
            .sort({ date: -1 })
            .limit(50);
        
        res.json({
            success: true,
            tickets: tickets
        });
    } catch (error) {
        console.error('Erreur tickets en attente:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des tickets en attente'
        });
    }
});

app.get('/api/tickets/:id', authenticateToken, async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        
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
        console.error('Erreur récupération ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la récupération du ticket'
        });
    }
});

app.delete('/api/tickets/:id', authenticateToken, async (req, res) => {
    try {
        const ticket = await Ticket.findByIdAndDelete(req.params.id);
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket non trouvé'
            });
        }
        
        res.json({
            success: true,
            message: 'Ticket supprimé avec succès'
        });
    } catch (error) {
        console.error('Erreur suppression ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la suppression du ticket'
        });
    }
});

// 5. ROUTES TICKETS MULTI-TIRAGES
app.get('/api/tickets/multi-draw', authenticateToken, async (req, res) => {
    try {
        const tickets = await MultiDrawTicket.find()
            .sort({ date: -1 })
            .limit(50);
        
        res.json({
            success: true,
            tickets: tickets
        });
    } catch (error) {
        console.error('Erreur tickets multi-tirages:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des tickets multi-tirages'
        });
    }
});

app.post('/api/tickets/multi-draw', authenticateToken, async (req, res) => {
    try {
        const { ticket, agentName } = req.body;
        
        // Trouver le prochain numéro
        const lastTicket = await MultiDrawTicket.findOne().sort({ number: -1 });
        const ticketNumber = lastTicket ? lastTicket.number + 1 : 500001;
        
        const multiDrawTicket = new MultiDrawTicket({
            number: ticketNumber,
            date: new Date(),
            bets: ticket.bets,
            draws: Array.from(ticket.draws),
            total: ticket.totalAmount,
            agentName: agentName
        });
        
        await multiDrawTicket.save();
        
        res.json({
            success: true,
            ticket: multiDrawTicket
        });
    } catch (error) {
        console.error('Erreur sauvegarde ticket multi-tirages:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la sauvegarde du ticket multi-tirages'
        });
    }
});

// 6. ROUTES GAGNANTS
app.get('/api/tickets/winning', authenticateToken, async (req, res) => {
    try {
        const winners = await Winner.find()
            .sort({ date: -1 })
            .limit(50);
        
        res.json({
            success: true,
            tickets: winners
        });
    } catch (error) {
        console.error('Erreur chargement gagnants:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des gagnants'
        });
    }
});

app.post('/api/check-winners', authenticateToken, async (req, res) => {
    try {
        const { draw, drawTime } = req.body;
        
        // Récupérer le résultat du tirage
        const result = await Result.findOne({ 
            drawCode: draw,
            drawTime: drawTime 
        }).sort({ date: -1 });
        
        if (!result) {
            return res.json({
                success: true,
                winningTickets: []
            });
        }
        
        // Récupérer les tickets de la journée
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tickets = await Ticket.find({
            draw: draw,
            drawTime: drawTime,
            date: { $gte: today }
        });
        
        const winningTickets = [];
        
        // Logique de vérification simplifiée
        for (const ticket of tickets) {
            let totalWinnings = 0;
            const winningBets = [];
            
            for (const bet of ticket.bets) {
                let winAmount = 0;
                
                if (bet.type === 'borlette' || bet.type === 'boulpe') {
                    // Vérifier contre les 3 lots
                    const lot1Last2 = result.lot1.substring(1);
                    if (bet.number === lot1Last2) {
                        winAmount = bet.amount * 60;
                    } else if (bet.number === result.lot2) {
                        winAmount = bet.amount * 20;
                    } else if (bet.number === result.lot3) {
                        winAmount = bet.amount * 10;
                    }
                } else if (bet.type === 'lotto3') {
                    if (bet.number === result.lot1) {
                        winAmount = bet.amount * 500;
                    }
                }
                
                if (winAmount > 0) {
                    totalWinnings += winAmount;
                    winningBets.push({
                        ...bet.toObject(),
                        winAmount: winAmount
                    });
                }
            }
            
            if (winningBets.length > 0) {
                winningTickets.push({
                    ...ticket.toObject(),
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

// 7. ROUTES RAPPORTS
app.get('/api/reports', authenticateToken, async (req, res) => {
    try {
        const { type, draw, drawTime, startDate, endDate } = req.query;
        
        let query = {};
        
        if (draw) query.draw = draw;
        if (drawTime) query.drawTime = drawTime;
        
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setDate(end.getDate() + 1);
            query.date = { $gte: start, $lt: end };
        }
        
        const tickets = await Ticket.find(query);
        
        res.json({
            success: true,
            report: {
                totalTickets: tickets.length,
                totalAmount: tickets.reduce((sum, t) => sum + t.total, 0),
                tickets: tickets
            }
        });
    } catch (error) {
        console.error('Erreur génération rapport:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la génération du rapport'
        });
    }
});

app.get('/api/reports/general', authenticateToken, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tickets = await Ticket.find({
            date: { $gte: today }
        });
        
        res.json({
            success: true,
            report: {
                totalTickets: tickets.length,
                totalAmount: tickets.reduce((sum, t) => sum + t.total, 0)
            }
        });
    } catch (error) {
        console.error('Erreur rapport général:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la génération du rapport général'
        });
    }
});

// 8. ROUTES CONFIGURATION
app.get('/api/company-info', async (req, res) => {
    try {
        let config = await Config.findOne();
        
        if (!config) {
            config = new Config();
            await config.save();
        }
        
        res.json({
            success: true,
            companyName: config.companyName,
            companyPhone: config.companyPhone,
            companyAddress: config.companyAddress,
            reportTitle: config.reportTitle,
            reportPhone: config.reportPhone
        });
    } catch (error) {
        console.error('Erreur info entreprise:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des informations de l\'entreprise'
        });
    }
});

app.get('/api/logo', async (req, res) => {
    try {
        const config = await Config.findOne();
        
        res.json({
            success: true,
            logoUrl: config ? config.logoUrl : 'logo-borlette.jpg'
        });
    } catch (error) {
        console.error('Erreur chargement logo:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement du logo'
        });
    }
});

// 9. ROUTES STATISTIQUES
app.get('/api/statistics', authenticateToken, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const totalTickets = await Ticket.countDocuments();
        const todayTickets = await Ticket.countDocuments({ date: { $gte: today } });
        const totalAmount = (await Ticket.aggregate([
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]))[0]?.total || 0;
        
        const todayAmount = (await Ticket.aggregate([
            { $match: { date: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]))[0]?.total || 0;
        
        res.json({
            success: true,
            statistics: {
                totalTickets: totalTickets,
                todayTickets: todayTickets,
                totalAmount: totalAmount,
                todayAmount: todayAmount,
                pendingTickets: await Ticket.countDocuments({ isSynced: false })
            }
        });
    } catch (error) {
        console.error('Erreur statistiques:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement des statistiques'
        });
    }
});

// 10. ROUTES HISTORIQUE
app.get('/api/history', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const tickets = await Ticket.find()
            .skip(skip)
            .limit(limit)
            .sort({ date: -1 });
        
        const total = await Ticket.countDocuments();
        
        res.json({
            success: true,
            history: tickets.map(ticket => ({
                id: ticket._id,
                date: ticket.date,
                draw: ticket.draw,
                drawTime: ticket.drawTime,
                bets: ticket.bets,
                total: ticket.total,
                agentName: ticket.agentName
            })),
            pagination: {
                page: page,
                limit: limit,
                total: total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Erreur historique:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors du chargement de l\'historique'
        });
    }
});

app.post('/api/history', authenticateToken, async (req, res) => {
    try {
        const record = req.body;
        
        // Simplement enregistrer dans les tickets
        const ticket = new Ticket({
            ...record,
            date: new Date()
        });
        
        await ticket.save();
        
        res.json({
            success: true,
            message: 'Historique enregistré'
        });
    } catch (error) {
        console.error('Erreur enregistrement historique:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'enregistrement de l\'historique'
        });
    }
});

// 11. ROUTE SANTÉ
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'online', 
        timestamp: new Date().toISOString(),
        database: db.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// === ROUTES HTML ===
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/lotato.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Gérer toutes les autres pages HTML
app.get('/*.html', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    res.sendFile(filePath);
});

// === GESTION ERREURS ===
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

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'Route API non trouvée'
        });
    }
    
    res.status(404).send('Page non trouvée');
});

// === DÉMARRAGE SERVEUR ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur Lotato démarré sur le port ${PORT}`);
    console.log(`📁 Fichiers statiques servis depuis: ${__dirname}`);
    console.log(`👑 Page de connexion: http://localhost:${PORT}/`);
    console.log(`🎰 Application Lotato: http://localhost:${PORT}/lotato.html`);
    console.log('');
    console.log('✅ Serveur prêt avec toutes les routes API !');
    console.log('');
    console.log('📋 Routes API disponibles:');
    console.log('  POST   /api/auth/login');
    console.log('  GET    /api/auth/verify');
    console.log('  GET    /api/draws');
    console.log('  GET    /api/results');
    console.log('  GET    /api/results/latest');
    console.log('  GET    /api/tickets');
    console.log('  POST   /api/tickets');
    console.log('  GET    /api/tickets/pending');
    console.log('  GET    /api/tickets/:id');
    console.log('  DELETE /api/tickets/:id');
    console.log('  GET    /api/tickets/multi-draw');
    console.log('  POST   /api/tickets/multi-draw');
    console.log('  GET    /api/tickets/winning');
    console.log('  POST   /api/check-winners');
    console.log('  GET    /api/reports');
    console.log('  GET    /api/reports/general');
    console.log('  GET    /api/company-info');
    console.log('  GET    /api/logo');
    console.log('  GET    /api/statistics');
    console.log('  GET    /api/history');
    console.log('  POST   /api/history');
    console.log('  GET    /api/health');
});