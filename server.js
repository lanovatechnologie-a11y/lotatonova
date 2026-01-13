// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/lotato';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB Atlas');
});

// Modèles Mongoose

// Modèle pour les administrateurs
const AdminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    agentId: { type: Number, required: true, unique: true },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', AdminSchema);

// Modèle pour les tickets
const TicketSchema = new mongoose.Schema({
    ticketNumber: { type: Number, required: true, unique: true },
    date: { type: Date, default: Date.now },
    draw: { type: String, required: true }, // 'miami', 'georgia', etc.
    drawTime: { type: String, required: true }, // 'morning', 'evening'
    bets: [{
        type: { type: String, required: true },
        name: { type: String, required: true },
        number: { type: String, required: true },
        amount: { type: Number, required: true },
        multiplier: { type: Number },
        options: mongoose.Schema.Types.Mixed,
        perOptionAmount: { type: Number },
        isAuto: { type: Boolean, default: false },
        isGroup: { type: Boolean, default: false },
        details: mongoose.Schema.Types.Mixed
    }],
    total: { type: Number, required: true },
    agentName: { type: String, required: true },
    agentId: { type: Number, required: true },
    isSynced: { type: Boolean, default: false },
    syncedAt: { type: Date }
});

const Ticket = mongoose.model('Ticket', TicketSchema);

// Modèle pour les tickets en attente
const PendingTicketSchema = new mongoose.Schema({
    ticketNumber: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    draw: { type: String, required: true },
    drawTime: { type: String, required: true },
    bets: [{
        type: { type: String, required: true },
        name: { type: String, required: true },
        number: { type: String, required: true },
        amount: { type: Number, required: true },
        multiplier: { type: Number },
        options: mongoose.Schema.Types.Mixed,
        perOptionAmount: { type: Number },
        isAuto: { type: Boolean, default: false },
        isGroup: { type: Boolean, default: false },
        details: mongoose.Schema.Types.Mixed
    }],
    total: { type: Number, required: true },
    agentName: { type: String, required: true },
    agentId: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

const PendingTicket = mongoose.model('PendingTicket', PendingTicketSchema);

// Modèle pour les tickets multi-tirages
const MultiDrawTicketSchema = new mongoose.Schema({
    ticketNumber: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    bets: [{
        gameType: { type: String, required: true },
        name: { type: String, required: true },
        number: { type: String, required: true },
        amount: { type: Number, required: true },
        multiplier: { type: Number },
        draws: [String],
        createdAt: { type: Date, default: Date.now }
    }],
    draws: [String],
    total: { type: Number, required: true },
    agentName: { type: String, required: true },
    agentId: { type: Number, required: true },
    isSynced: { type: Boolean, default: false },
    syncedAt: { type: Date }
});

const MultiDrawTicket = mongoose.model('MultiDrawTicket', MultiDrawTicketSchema);

// Modèle pour les résultats
const ResultSchema = new mongoose.Schema({
    draw: { type: String, required: true },
    time: { type: String, required: true }, // 'morning', 'evening'
    date: { type: Date, required: true },
    lot1: { type: String, required: true }, // 3 chiffres
    lot2: { type: String, required: true }, // 2 chiffres
    lot3: { type: String, required: true }, // 2 chiffres
    createdAt: { type: Date, default: Date.now }
});

const Result = mongoose.model('Result', ResultSchema);

// Modèle pour l'historique
const HistorySchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    draw: { type: String, required: true },
    drawTime: { type: String, required: true },
    bets: [{
        type: { type: String, required: true },
        name: { type: String, required: true },
        number: { type: String, required: true },
        amount: { type: Number, required: true },
        multiplier: { type: Number },
        options: mongoose.Schema.Types.Mixed,
        perOptionAmount: { type: Number },
        isAuto: { type: Boolean, default: false },
        isGroup: { type: Boolean, default: false },
        details: mongoose.Schema.Types.Mixed
    }],
    total: { type: Number, required: true },
    agentName: { type: String, required: true },
    agentId: { type: Number, required: true }
});

const History = mongoose.model('History', HistorySchema);

// Modèle pour les informations de l'entreprise
const CompanyInfoSchema = new mongoose.Schema({
    name: { type: String, required: true, default: 'Nova Lotto' },
    phone: { type: String, default: '+509 32 53 49 58' },
    address: { type: String, default: 'Cap Haïtien' },
    reportTitle: { type: String, default: 'Nova Lotto' },
    reportPhone: { type: String, default: '40104585' },
    logoUrl: { type: String, default: 'logo-borlette.jpg' },
    updatedAt: { type: Date, default: Date.now }
});

const CompanyInfo = mongoose.model('CompanyInfo', CompanyInfoSchema);

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token d\'authentification requis' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'lotato-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token invalide' });
        }
        req.user = user;
        next();
    });
};

// Routes API

// 1. Vérification santé du serveur
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Serveur LOTATO en ligne',
        timestamp: new Date(),
        database: db.readyState === 1 ? 'Connected' : 'Disconnected'
    });
});

// 2. Authentification
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Vérifier les identifiants de démonstration
        if (username === 'admin' && password === 'admin123') {
            const token = jwt.sign(
                { 
                    username: 'admin', 
                    name: 'Administrateur',
                    agentId: 1 
                },
                process.env.JWT_SECRET || 'lotato-secret-key',
                { expiresIn: '24h' }
            );
            
            return res.json({ 
                success: true, 
                token,
                user: {
                    username: 'admin',
                    name: 'Administrateur',
                    agentId: 1
                }
            });
        }
        
        // Rechercher l'administrateur dans la base de données
        const admin = await Admin.findOne({ username, isActive: true });
        
        if (!admin) {
            return res.status(401).json({ 
                success: false, 
                error: 'Identifiant ou mot de passe incorrect' 
            });
        }
        
        // Comparer le mot de passe
        const validPassword = await bcrypt.compare(password, admin.password);
        
        if (!validPassword) {
            return res.status(401).json({ 
                success: false, 
                error: 'Identifiant ou mot de passe incorrect' 
            });
        }
        
        // Générer le token JWT
        const token = jwt.sign(
            { 
                id: admin._id, 
                username: admin.username, 
                name: admin.name,
                agentId: admin.agentId 
            },
            process.env.JWT_SECRET || 'lotato-secret-key',
            { expiresIn: '24h' }
        );
        
        res.json({ 
            success: true, 
            token,
            user: {
                id: admin._id,
                username: admin.username,
                name: admin.name,
                agentId: admin.agentId
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur serveur lors de l\'authentification' 
        });
    }
});

// 3. Récupérer les résultats
app.get('/api/results', async (req, res) => {
    try {
        // Récupérer les résultats les plus récents pour chaque tiraj
        const draws = ['miami', 'georgia', 'newyork', 'texas', 'tunisia'];
        const times = ['morning', 'evening'];
        
        let results = {};
        
        for (const draw of draws) {
            results[draw] = {};
            for (const time of times) {
                const latestResult = await Result.findOne({ draw, time })
                    .sort({ date: -1 })
                    .limit(1);
                
                if (latestResult) {
                    results[draw][time] = {
                        date: latestResult.date,
                        lot1: latestResult.lot1,
                        lot2: latestResult.lot2,
                        lot3: latestResult.lot3
                    };
                } else {
                    // Résultats par défaut
                    const defaultResults = {
                        'miami': { 'morning': { lot1: '451', lot2: '23', lot3: '45' }, 'evening': { lot1: '892', lot2: '34', lot3: '56' } },
                        'georgia': { 'morning': { lot1: '327', lot2: '45', lot3: '89' }, 'evening': { lot1: '567', lot2: '12', lot3: '34' } },
                        'newyork': { 'morning': { lot1: '892', lot2: '34', lot3: '56' }, 'evening': { lot1: '123', lot2: '45', lot3: '67' } },
                        'texas': { 'morning': { lot1: '567', lot2: '89', lot3: '01' }, 'evening': { lot1: '234', lot2: '56', lot3: '78' } },
                        'tunisia': { 'morning': { lot1: '234', lot2: '56', lot3: '78' }, 'evening': { lot1: '345', lot2: '67', lot3: '89' } }
                    };
                    
                    results[draw][time] = defaultResults[draw]?.[time] || { 
                        lot1: '000', 
                        lot2: '00', 
                        lot3: '00' 
                    };
                }
            }
        }
        
        res.json({ 
            success: true, 
            results 
        });
        
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération des résultats' 
        });
    }
});

// 4. Vérifier les tickets gagnants
app.post('/api/check-winners', authenticateToken, async (req, res) => {
    try {
        const { draw, drawTime, date } = req.body;
        
        // Récupérer les résultats pour le tirage spécifié
        let result;
        if (draw && drawTime) {
            result = await Result.findOne({ draw, time: drawTime }).sort({ date: -1 });
        } else if (date) {
            // Rechercher par date
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            
            result = await Result.findOne({ date: { $gte: startDate, $lte: endDate } }).sort({ date: -1 });
        } else {
            // Derniers résultats
            result = await Result.findOne().sort({ date: -1 });
        }
        
        if (!result) {
            return res.json({ 
                success: true, 
                winningTickets: [],
                message: 'Aucun résultat trouvé pour cette date' 
            });
        }
        
        // Récupérer tous les tickets pour cette période
        const tickets = await Ticket.find({ 
            draw: result.draw,
            drawTime: result.time,
            date: { $gte: new Date(result.date.getTime() - 24*60*60*1000) } // 24h avant
        });
        
        // Fonction pour vérifier si un ticket est gagnant
        const checkTicketAgainstResult = (ticket, result) => {
            const winningBets = [];
            
            ticket.bets.forEach(bet => {
                // Logique de vérification des paris
                // (Reprendre la logique du frontend)
                const lot1 = result.lot1;
                const lot2 = result.lot2;
                const lot3 = result.lot3;
                const lot1Last2 = lot1.substring(1);
                
                let isWinner = false;
                let winAmount = 0;
                let winType = '';
                
                switch(bet.type) {
                    case 'borlette':
                    case 'boulpe':
                        if (bet.number === lot1Last2) {
                            isWinner = true;
                            winAmount = bet.amount * 60;
                            winType = '1er lot';
                        } else if (bet.number === lot2) {
                            isWinner = true;
                            winAmount = bet.amount * 20;
                            winType = '2e lot';
                        } else if (bet.number === lot3) {
                            isWinner = true;
                            winAmount = bet.amount * 10;
                            winType = '3e lot';
                        }
                        break;
                        
                    case 'lotto3':
                        if (bet.number === lot1) {
                            isWinner = true;
                            winAmount = bet.amount * 500;
                            winType = 'Lotto 3';
                        }
                        break;
                        
                    // ... autres types de paris
                }
                
                if (isWinner) {
                    winningBets.push({
                        ...bet.toObject(),
                        winAmount,
                        winType,
                        matchedNumber: bet.number
                    });
                }
            });
            
            return winningBets;
        };
        
        // Vérifier chaque ticket
        const winningTickets = [];
        tickets.forEach(ticket => {
            const winningBets = checkTicketAgainstResult(ticket, result);
            
            if (winningBets.length > 0) {
                const totalWinnings = winningBets.reduce((sum, bet) => sum + bet.winAmount, 0);
                
                winningTickets.push({
                    ...ticket.toObject(),
                    winningBets,
                    totalWinnings,
                    result: {
                        lot1: result.lot1,
                        lot2: result.lot2,
                        lot3: result.lot3
                    }
                });
            }
        });
        
        res.json({ 
            success: true, 
            winningTickets,
            result: {
                draw: result.draw,
                time: result.time,
                date: result.date,
                lot1: result.lot1,
                lot2: result.lot2,
                lot3: result.lot3
            }
        });
        
    } catch (error) {
        console.error('Error checking winners:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la vérification des tickets gagnants' 
        });
    }
});

// 5. Récupérer tous les tickets
app.get('/api/tickets', authenticateToken, async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ date: -1 }).limit(100);
        const nextTicketNumber = await Ticket.countDocuments() + 1;
        
        res.json({ 
            success: true, 
            tickets,
            nextTicketNumber
        });
        
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération des tickets' 
        });
    }
});

// 6. Créer un ticket
app.post('/api/tickets', authenticateToken, async (req, res) => {
    try {
        const { ticketNumber, date, draw, drawTime, bets, total, agentName, agentId } = req.body;
        
        // Vérifier si le numéro de ticket existe déjà
        const existingTicket = await Ticket.findOne({ ticketNumber });
        if (existingTicket) {
            return res.status(400).json({ 
                success: false, 
                error: 'Numéro de ticket déjà utilisé' 
            });
        }
        
        const newTicket = new Ticket({
            ticketNumber,
            date: date || new Date(),
            draw,
            drawTime,
            bets,
            total,
            agentName,
            agentId,
            isSynced: true,
            syncedAt: new Date()
        });
        
        await newTicket.save();
        
        // Ajouter à l'historique
        const historyRecord = new History({
            date: newTicket.date,
            draw: newTicket.draw,
            drawTime: newTicket.drawTime,
            bets: newTicket.bets,
            total: newTicket.total,
            agentName: newTicket.agentName,
            agentId: newTicket.agentId
        });
        
        await historyRecord.save();
        
        res.status(201).json({ 
            success: true, 
            ticket: newTicket,
            message: 'Ticket créé avec succès' 
        });
        
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la création du ticket' 
        });
    }
});

// 7. Récupérer les tickets en attente
app.get('/api/tickets/pending', authenticateToken, async (req, res) => {
    try {
        const pendingTickets = await PendingTicket.find().sort({ createdAt: -1 }).limit(50);
        
        res.json({ 
            success: true, 
            tickets: pendingTickets 
        });
        
    } catch (error) {
        console.error('Error fetching pending tickets:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération des tickets en attente' 
        });
    }
});

// 8. Créer un ticket en attente
app.post('/api/tickets/pending', authenticateToken, async (req, res) => {
    try {
        const { ticketNumber, date, draw, drawTime, bets, total, agentName, agentId } = req.body;
        
        const newPendingTicket = new PendingTicket({
            ticketNumber,
            date: date || new Date(),
            draw,
            drawTime,
            bets,
            total,
            agentName,
            agentId
        });
        
        await newPendingTicket.save();
        
        res.status(201).json({ 
            success: true, 
            ticket: newPendingTicket,
            message: 'Ticket en attente créé avec succès' 
        });
        
    } catch (error) {
        console.error('Error creating pending ticket:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la création du ticket en attente' 
        });
    }
});

// 9. Récupérer les tickets gagnants
app.get('/api/tickets/winning', authenticateToken, async (req, res) => {
    try {
        // Cette route pourrait être plus complexe selon la logique métier
        // Pour l'instant, retourner les tickets qui ont été marqués comme gagnants
        const winningTickets = await Ticket.find({ 
            // Ajouter des critères pour identifier les tickets gagnants
        }).sort({ date: -1 }).limit(50);
        
        res.json({ 
            success: true, 
            tickets: winningTickets 
        });
        
    } catch (error) {
        console.error('Error fetching winning tickets:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération des tickets gagnants' 
        });
    }
});

// 10. Récupérer l'historique
app.get('/api/history', authenticateToken, async (req, res) => {
    try {
        const history = await History.find().sort({ date: -1 }).limit(100);
        
        res.json({ 
            success: true, 
            history 
        });
        
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération de l\'historique' 
        });
    }
});

// 11. Créer un historique
app.post('/api/history', authenticateToken, async (req, res) => {
    try {
        const { date, draw, drawTime, bets, total, agentName, agentId } = req.body;
        
        const newHistory = new History({
            date: date || new Date(),
            draw,
            drawTime,
            bets,
            total,
            agentName,
            agentId
        });
        
        await newHistory.save();
        
        res.status(201).json({ 
            success: true, 
            history: newHistory,
            message: 'Historique créé avec succès' 
        });
        
    } catch (error) {
        console.error('Error creating history:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la création de l\'historique' 
        });
    }
});

// 12. Récupérer les tickets multi-tirages
app.get('/api/tickets/multi-draw', authenticateToken, async (req, res) => {
    try {
        const multiDrawTickets = await MultiDrawTicket.find().sort({ date: -1 }).limit(50);
        
        res.json({ 
            success: true, 
            tickets: multiDrawTickets 
        });
        
    } catch (error) {
        console.error('Error fetching multi-draw tickets:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération des tickets multi-tirages' 
        });
    }
});

// 13. Créer un ticket multi-tirages
app.post('/api/tickets/multi-draw', authenticateToken, async (req, res) => {
    try {
        const { ticketNumber, date, bets, draws, total, agentName, agentId } = req.body;
        
        // Vérifier si le numéro de ticket existe déjà
        const existingTicket = await MultiDrawTicket.findOne({ ticketNumber });
        if (existingTicket) {
            return res.status(400).json({ 
                success: false, 
                error: 'Numéro de ticket déjà utilisé' 
            });
        }
        
        const newMultiDrawTicket = new MultiDrawTicket({
            ticketNumber,
            date: date || new Date(),
            bets,
            draws,
            total,
            agentName,
            agentId,
            isSynced: true,
            syncedAt: new Date()
        });
        
        await newMultiDrawTicket.save();
        
        res.status(201).json({ 
            success: true, 
            ticket: newMultiDrawTicket,
            message: 'Ticket multi-tirages créé avec succès' 
        });
        
    } catch (error) {
        console.error('Error creating multi-draw ticket:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la création du ticket multi-tirages' 
        });
    }
});

// 14. Récupérer les informations de l'entreprise
app.get('/api/company-info', async (req, res) => {
    try {
        let companyInfo = await CompanyInfo.findOne();
        
        if (!companyInfo) {
            // Créer des informations par défaut
            companyInfo = new CompanyInfo({
                name: 'Nova Lotto',
                phone: '+509 32 53 49 58',
                address: 'Cap Haïtien',
                reportTitle: 'Nova Lotto',
                reportPhone: '40104585',
                logoUrl: 'logo-borlette.jpg'
            });
            
            await companyInfo.save();
        }
        
        res.json({ 
            success: true, 
            companyInfo 
        });
        
    } catch (error) {
        console.error('Error fetching company info:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération des informations de l\'entreprise' 
        });
    }
});

// 15. Récupérer le logo
app.get('/api/logo', async (req, res) => {
    try {
        const companyInfo = await CompanyInfo.findOne();
        
        if (!companyInfo) {
            return res.json({ 
                success: true, 
                logoUrl: 'logo-borlette.jpg' 
            });
        }
        
        res.json({ 
            success: true, 
            logoUrl: companyInfo.logoUrl 
        });
        
    } catch (error) {
        console.error('Error fetching logo:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la récupération du logo' 
        });
    }
});

// 16. Route pour créer un administrateur (dev seulement)
app.post('/api/admin/create', async (req, res) => {
    try {
        const { username, password, name, agentId } = req.body;
        
        // Vérifier si l'administrateur existe déjà
        const existingAdmin = await Admin.findOne({ 
            $or: [{ username }, { agentId }] 
        });
        
        if (existingAdmin) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nom d\'utilisateur ou ID agent déjà utilisé' 
            });
        }
        
        // Hasher le mot de passe
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const newAdmin = new Admin({
            username,
            password: hashedPassword,
            name,
            agentId
        });
        
        await newAdmin.save();
        
        res.status(201).json({ 
            success: true, 
            admin: {
                id: newAdmin._id,
                username: newAdmin.username,
                name: newAdmin.name,
                agentId: newAdmin.agentId
            },
            message: 'Administrateur créé avec succès' 
        });
        
    } catch (error) {
        console.error('Error creating admin:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la création de l\'administrateur' 
        });
    }
});

// 17. Synchroniser les tickets en attente
app.post('/api/sync/pending', authenticateToken, async (req, res) => {
    try {
        const { ticketIds } = req.body;
        
        if (!ticketIds || !Array.isArray(ticketIds)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Liste d\'IDs de tickets requise' 
            });
        }
        
        const results = [];
        
        for (const ticketId of ticketIds) {
            const pendingTicket = await PendingTicket.findById(ticketId);
            
            if (pendingTicket) {
                // Créer un ticket normal
                const newTicket = new Ticket({
                    ticketNumber: pendingTicket.ticketNumber,
                    date: pendingTicket.date,
                    draw: pendingTicket.draw,
                    drawTime: pendingTicket.drawTime,
                    bets: pendingTicket.bets,
                    total: pendingTicket.total,
                    agentName: pendingTicket.agentName,
                    agentId: pendingTicket.agentId,
                    isSynced: true,
                    syncedAt: new Date()
                });
                
                await newTicket.save();
                
                // Ajouter à l'historique
                const historyRecord = new History({
                    date: newTicket.date,
                    draw: newTicket.draw,
                    drawTime: newTicket.drawTime,
                    bets: newTicket.bets,
                    total: newTicket.total,
                    agentName: newTicket.agentName,
                    agentId: newTicket.agentId
                });
                
                await historyRecord.save();
                
                // Supprimer le ticket en attente
                await PendingTicket.findByIdAndDelete(ticketId);
                
                results.push({
                    ticketId,
                    success: true,
                    newTicketNumber: newTicket.ticketNumber
                });
            } else {
                results.push({
                    ticketId,
                    success: false,
                    error: 'Ticket non trouvé'
                });
            }
        }
        
        res.json({ 
            success: true, 
            results,
            message: 'Synchronisation terminée' 
        });
        
    } catch (error) {
        console.error('Error syncing pending tickets:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la synchronisation des tickets en attente' 
        });
    }
});

// 18. Générer un rapport
app.get('/api/report', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate, draw, drawTime } = req.query;
        
        let query = {};
        
        // Filtrer par date
        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        
        // Filtrer par tiraj
        if (draw) {
            query.draw = draw;
        }
        
        if (drawTime) {
            query.drawTime = drawTime;
        }
        
        // Récupérer les tickets
        const tickets = await Ticket.find(query).sort({ date: -1 });
        
        // Calculer les statistiques
        const totalTickets = tickets.length;
        const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
        
        // Statistiques par tiraj
        const statsByDraw = {};
        tickets.forEach(ticket => {
            const key = `${ticket.draw}-${ticket.drawTime}`;
            if (!statsByDraw[key]) {
                statsByDraw[key] = {
                    draw: ticket.draw,
                    drawTime: ticket.drawTime,
                    count: 0,
                    total: 0
                };
            }
            statsByDraw[key].count++;
            statsByDraw[key].total += ticket.total;
        });
        
        res.json({ 
            success: true, 
            report: {
                period: {
                    startDate: startDate || 'Non spécifié',
                    endDate: endDate || 'Non spécifié'
                },
                summary: {
                    totalTickets,
                    totalAmount
                },
                statsByDraw: Object.values(statsByDraw),
                tickets: tickets.map(t => ({
                    ticketNumber: t.ticketNumber,
                    date: t.date,
                    draw: t.draw,
                    drawTime: t.drawTime,
                    total: t.total,
                    agentName: t.agentName
                }))
            }
        });
        
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la génération du rapport' 
        });
    }
});

// 19. Initialiser la base de données avec des données de test
app.post('/api/init-test-data', async (req, res) => {
    try {
        // Vérifier si c'est l'environnement de développement
        if (process.env.NODE_ENV !== 'development') {
            return res.status(403).json({ 
                success: false, 
                error: 'Cette route n\'est disponible qu\'en environnement de développement' 
            });
        }
        
        // Créer un administrateur de test
        const existingAdmin = await Admin.findOne({ username: 'test' });
        if (!existingAdmin) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('test123', salt);
            
            const testAdmin = new Admin({
                username: 'test',
                password: hashedPassword,
                name: 'Test Admin',
                agentId: 999
            });
            
            await testAdmin.save();
        }
        
        // Créer des résultats de test
        const draws = ['miami', 'georgia', 'newyork', 'texas', 'tunisia'];
        const times = ['morning', 'evening'];
        
        for (const draw of draws) {
            for (const time of times) {
                const existingResult = await Result.findOne({ draw, time });
                
                if (!existingResult) {
                    const testResult = new Result({
                        draw,
                        time,
                        date: new Date(),
                        lot1: Math.floor(Math.random() * 900 + 100).toString(), // 100-999
                        lot2: Math.floor(Math.random() * 90 + 10).toString(),   // 10-99
                        lot3: Math.floor(Math.random() * 90 + 10).toString()    // 10-99
                    });
                    
                    await testResult.save();
                }
            }
        }
        
        // Créer des tickets de test
        const existingTicket = await Ticket.findOne({ ticketNumber: 1000 });
        if (!existingTicket) {
            for (let i = 1; i <= 10; i++) {
                const testTicket = new Ticket({
                    ticketNumber: 1000 + i,
                    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000), // Jours précédents
                    draw: draws[Math.floor(Math.random() * draws.length)],
                    drawTime: times[Math.floor(Math.random() * times.length)],
                    bets: [{
                        type: 'borlette',
                        name: 'BORLETTE',
                        number: Math.floor(Math.random() * 100).toString().padStart(2, '0'),
                        amount: 10,
                        multiplier: 60
                    }],
                    total: 10,
                    agentName: 'Test Agent',
                    agentId: 999,
                    isSynced: true,
                    syncedAt: new Date()
                });
                
                await testTicket.save();
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Données de test initialisées avec succès' 
        });
        
    } catch (error) {
        console.error('Error initializing test data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de l\'initialisation des données de test' 
        });
    }
});

// Servir le fichier HTML principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`Serveur LOTATO démarré sur le port ${PORT}`);
    console.log(`URL: http://localhost:${PORT}`);
});