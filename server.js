const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware de compression GZIP
app.use(compression({
    level: 6, // Niveau de compression (1-9, 6 = bon équilibre)
    threshold: 0, // Compresser même les petites réponses
    filter: (req, res) => {
        // Ne pas compresser si l'en-tête x-no-compression est présent
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

app.use(cookieParser());
app.use(cors({
    origin: ['http://localhost:3000', 'https://lotato-frontend.onrender.com'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques avec cache optimisé pour PWA
app.use(express.static(__dirname, {
    setHeaders: (res, filePath) => {
        // Cache plus long pour les assets statiques
        if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.png') || filePath.endsWith('.jpg')) {
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 jour
        }
        // Pas de cache pour les fichiers HTML
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// MongoDB Atlas Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://your_username:your_password@cluster0.mongodb.net/lotato?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ MongoDB connection error:'));
db.once('open', () => {
    console.log('✅ MongoDB Atlas connected successfully');
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'lotato-secret-key-2024';

// === SCHÉMAS MONGODB ===

// Schéma utilisateur
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['agent', 'supervisor1', 'supervisor2', 'subsystem', 'master'],
        required: true,
        default: 'agent'
    },
    name: { type: String, required: true },
    commissionRate: { type: Number, default: 10 }, // Taux de commission en %
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Schéma tirage (draw)
const drawSchema = new mongoose.Schema({
    drawId: { type: String, required: true, unique: true }, // miami, georgia, newyork, texas, tunisia
    name: { type: String, required: true }, // Nom affiché
    times: {
        morning: { type: String, required: true },
        evening: { type: String, required: true }
    },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
});

// Schéma résultat
const resultSchema = new mongoose.Schema({
    drawId: { type: String, required: true },
    drawTime: { type: String, enum: ['morning', 'evening'], required: true },
    date: { type: Date, required: true },
    lot1: { type: String, required: true }, // 3 chiffres
    lot2: { type: String, required: true }, // 2 chiffres
    lot3: { type: String, required: true }, // 2 chiffres
    verified: { type: Boolean, default: false },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date }
});

// Schéma type de pari
const betTypeSchema = new mongoose.Schema({
    gameId: { type: String, required: true, unique: true }, // lotto3, grap, marriage, etc.
    name: { type: String, required: true },
    multiplier: { type: Number, required: true },
    multiplier2: { type: Number }, // Pour borlette 2e lot
    multiplier3: { type: Number }, // Pour borlette 3e lot
    icon: { type: String },
    description: { type: String },
    category: { type: String, enum: ['borlette', 'lotto', 'special'] },
    isActive: { type: Boolean, default: true }
});

// Schéma fiche (ticket)
const ticketSchema = new mongoose.Schema({
    ticketNumber: { type: String, required: true, unique: true }, // Format: NOVA-001234
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    agentName: { type: String, required: true },
    drawId: { type: String, required: true },
    drawTime: { type: String, required: true },
    bets: [{
        type: { type: String, required: true },
        name: { type: String, required: true },
        number: { type: String, required: true },
        amount: { type: Number, required: true },
        multiplier: { type: Number, required: true },
        options: { type: Object }, // Pour Lotto 4 et 5
        perOptionAmount: { type: Number },
        isAuto: { type: Boolean, default: false },
        isGroup: { type: Boolean, default: false },
        details: { type: Array }
    }],
    totalAmount: { type: Number, required: true },
    commissionAmount: { type: Number, default: 0 },
    netAmount: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'synced', 'paid', 'cancelled'],
        default: 'pending'
    },
    syncDate: { type: Date },
    printedDate: { type: Date },
    createdAt: { type: Date, default: Date.now },
    isMultiDraw: { type: Boolean, default: false },
    multiDraws: [{ type: String }] // Pour les fiches multi-tirages
});

// Schéma fiche gagnante
const winningTicketSchema = new mongoose.Schema({
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    drawId: { type: String, required: true },
    drawTime: { type: String, required: true },
    resultId: { type: mongoose.Schema.Types.ObjectId, ref: 'Result', required: true },
    winningBets: [{
        betIndex: { type: Number, required: true },
        winAmount: { type: Number, required: true },
        winType: { type: String, required: true }, // 1er lot, 2e lot, etc.
        matchedNumber: { type: String }
    }],
    totalWinnings: { type: Number, required: true },
    paid: { type: Boolean, default: false },
    paidDate: { type: Date },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

// Schéma entreprise
const companySchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String },
    address: { type: String },
    logoUrl: { type: String },
    reportTitle: { type: String },
    reportPhone: { type: String },
    commissionRates: {
        agent: { type: Number, default: 10 },
        supervisor1: { type: Number, default: 8 },
        supervisor2: { type: Number, default: 5 }
    },
    updatedAt: { type: Date, default: Date.now }
});

// Schéma journal d'activité
const activityLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    details: { type: Object },
    ipAddress: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now }
});

// Modèles
const User = mongoose.model('User', userSchema);
const Draw = mongoose.model('Draw', drawSchema);
const Result = mongoose.model('Result', resultSchema);
const BetType = mongoose.model('BetType', betTypeSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const WinningTicket = mongoose.model('WinningTicket', winningTicketSchema);
const Company = mongoose.model('Company', companySchema);
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

// === MIDDLEWARE D'AUTHENTIFICATION ===
async function requireAuth(req, res, next) {
    try {
        const token = req.cookies.nova_token || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token manquant' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user || !user.isActive) {
            res.clearCookie('nova_token');
            return res.status(401).json({ 
                success: false, 
                error: 'Utilisateur non trouvé ou inactif' 
            });
        }
        
        // Mettre à jour la dernière connexion
        user.lastLogin = new Date();
        await user.save();
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.clearCookie('nova_token');
        return res.status(401).json({ 
            success: false, 
            error: 'Token invalide' 
        });
    }
}

// Middleware de log d'activité
async function logActivity(req, res, next) {
    const originalSend = res.send;
    res.send = function(data) {
        if (req.user) {
            const log = new ActivityLog({
                userId: req.user._id,
                action: `${req.method} ${req.path}`,
                details: {
                    method: req.method,
                    path: req.path,
                    query: req.query,
                    body: req.method === 'POST' ? req.body : null,
                    statusCode: res.statusCode,
                    response: typeof data === 'string' ? data.substring(0, 500) : data
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });
            log.save().catch(err => console.error('Log save error:', err));
        }
        originalSend.call(this, data);
    };
    next();
}

// === ROUTES AUTH ===

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username, isActive: true });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Identifiant ou mot de passe incorrect'
            });
        }

        // Comparer le mot de passe (non hashé dans ce cas pour compatibilité)
        if (user.password !== password) {
            return res.status(401).json({
                success: false,
                error: 'Identifiant ou mot de passe incorrect'
            });
        }

        // Générer token JWT
        const token = jwt.sign(
            { 
                userId: user._id,
                username: user.username,
                role: user.role,
                name: user.name
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Cookie
        res.cookie('nova_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            path: '/'
        });

        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                commissionRate: user.commissionRate
            },
            token: token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la connexion'
        });
    }
});

// Verify token
app.post('/api/auth/verify-token', async (req, res) => {
    try {
        const token = req.cookies.nova_token || req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Non authentifié' 
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user || !user.isActive) {
            res.clearCookie('nova_token');
            return res.status(401).json({ 
                success: false, 
                error: 'Utilisateur non trouvé' 
            });
        }

        res.json({ 
            success: true,
            user: { 
                id: user._id, 
                username: user.username, 
                name: user.name,
                role: user.role, 
                commissionRate: user.commissionRate
            } 
        });

    } catch (error) {
        console.error('Verify token error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur vérification' 
        });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('nova_token');
    res.json({ 
        success: true, 
        message: 'Déconnexion réussie' 
    });
});

// === ROUTES DONNÉES LOTATO ===

// Récupérer tous les tirages
app.get('/api/draws', async (req, res) => {
    try {
        const draws = await Draw.find({ isActive: true }).sort({ order: 1 });
        res.json({ success: true, draws });
    } catch (error) {
        console.error('Error fetching draws:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer les types de paris
app.get('/api/bet-types', async (req, res) => {
    try {
        const betTypes = await BetType.find({ isActive: true });
        res.json({ success: true, betTypes });
    } catch (error) {
        console.error('Error fetching bet types:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer les résultats
app.get('/api/results', async (req, res) => {
    try {
        const { drawId, drawTime, date } = req.query;
        
        let query = {};
        if (drawId) query.drawId = drawId;
        if (drawTime) query.drawTime = drawTime;
        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            query.date = { $gte: startDate, $lte: endDate };
        }
        
        const results = await Result.find(query)
            .sort({ date: -1 })
            .limit(100);
        
        res.json({ success: true, results });
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer les derniers résultats pour tous les tirages
app.get('/api/results/latest', async (req, res) => {
    try {
        const draws = await Draw.find({ isActive: true });
        const latestResults = [];
        
        for (const draw of draws) {
            const morningResult = await Result.findOne({ 
                drawId: draw.drawId, 
                drawTime: 'morning' 
            }).sort({ date: -1 });
            
            const eveningResult = await Result.findOne({ 
                drawId: draw.drawId, 
                drawTime: 'evening' 
            }).sort({ date: -1 });
            
            latestResults.push({
                drawId: draw.drawId,
                drawName: draw.name,
                morning: morningResult,
                evening: eveningResult
            });
        }
        
        res.json({ success: true, results: latestResults });
    } catch (error) {
        console.error('Error fetching latest results:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Sauvegarder une fiche
app.post('/api/tickets', requireAuth, async (req, res) => {
    try {
        const {
            drawId,
            drawTime,
            bets,
            totalAmount,
            isMultiDraw = false,
            multiDraws = []
        } = req.body;
        
        if (!drawId || !drawTime || !bets || !Array.isArray(bets) || bets.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Données de fiche incomplètes' 
            });
        }
        
        // Générer numéro de fiche unique
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const count = await Ticket.countDocuments({
            createdAt: {
                $gte: new Date(today.setHours(0, 0, 0, 0)),
                $lt: new Date(today.setHours(23, 59, 59, 999))
            }
        });
        
        const ticketNumber = `NOVA-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;
        
        // Calculer la commission
        const commissionRate = req.user.commissionRate || 10;
        const commissionAmount = totalAmount * (commissionRate / 100);
        const netAmount = totalAmount - commissionAmount;
        
        // Créer la fiche
        const ticket = new Ticket({
            ticketNumber,
            agentId: req.user._id,
            agentName: req.user.name,
            drawId,
            drawTime,
            bets,
            totalAmount,
            commissionAmount,
            netAmount,
            isMultiDraw,
            multiDraws,
            status: 'pending',
            printedDate: new Date()
        });
        
        await ticket.save();
        
        // Log l'activité
        await ActivityLog.create({
            userId: req.user._id,
            action: 'CREATE_TICKET',
            details: {
                ticketNumber,
                drawId,
                drawTime,
                totalAmount,
                betsCount: bets.length
            }
        });
        
        res.json({ 
            success: true, 
            ticket: {
                id: ticket._id,
                ticketNumber: ticket.ticketNumber,
                createdAt: ticket.createdAt,
                totalAmount: ticket.totalAmount
            }
        });
        
    } catch (error) {
        console.error('Error saving ticket:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer les fiches d'un agent
app.get('/api/tickets/my-tickets', requireAuth, async (req, res) => {
    try {
        const { startDate, endDate, status } = req.query;
        
        let query = { agentId: req.user._id };
        
        if (status) {
            query.status = status;
        }
        
        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        
        const tickets = await Ticket.find(query)
            .sort({ createdAt: -1 })
            .limit(100);
        
        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Vérifier les fiches gagnantes
app.post('/api/tickets/check-winners', requireAuth, async (req, res) => {
    try {
        const { drawId, drawTime, date } = req.body;
        
        // Trouver le résultat pour ce tirage
        const result = await Result.findOne({
            drawId,
            drawTime,
            date: {
                $gte: new Date(date).setHours(0, 0, 0, 0),
                $lt: new Date(date).setHours(23, 59, 59, 999)
            }
        });
        
        if (!result) {
            return res.json({ 
                success: true, 
                winningTickets: [],
                message: 'Aucun résultat trouvé pour ce tirage'
            });
        }
        
        // Trouver toutes les fiches pour ce tirage
        const tickets = await Ticket.find({
            drawId,
            drawTime,
            createdAt: {
                $gte: new Date(date).setHours(0, 0, 0, 0),
                $lt: new Date(date).setHours(23, 59, 59, 999)
            },
            status: { $in: ['pending', 'synced'] }
        });
        
        const winningTickets = [];
        
        for (const ticket of tickets) {
            const winningBets = [];
            
            for (let i = 0; i < ticket.bets.length; i++) {
                const bet = ticket.bets[i];
                const winningInfo = checkBetAgainstResult(bet, result);
                
                if (winningInfo.isWinner) {
                    winningBets.push({
                        betIndex: i,
                        winAmount: winningInfo.winAmount,
                        winType: winningInfo.winType,
                        matchedNumber: winningInfo.matchedNumber
                    });
                }
            }
            
            if (winningBets.length > 0) {
                const totalWinnings = winningBets.reduce((sum, bet) => sum + bet.winAmount, 0);
                
                // Créer ou mettre à jour l'enregistrement de fiche gagnante
                const winningTicket = new WinningTicket({
                    ticketId: ticket._id,
                    agentId: ticket.agentId,
                    drawId: ticket.drawId,
                    drawTime: ticket.drawTime,
                    resultId: result._id,
                    winningBets,
                    totalWinnings
                });
                
                await winningTicket.save();
                winningTickets.push(winningTicket);
            }
        }
        
        res.json({ 
            success: true, 
            winningTickets,
            result: {
                lot1: result.lot1,
                lot2: result.lot2,
                lot3: result.lot3,
                date: result.date
            }
        });
        
    } catch (error) {
        console.error('Error checking winners:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Fonction pour vérifier un pari contre un résultat
function checkBetAgainstResult(bet, result) {
    const lot1 = result.lot1;
    const lot2 = result.lot2;
    const lot3 = result.lot3;
    const lot1Last2 = lot1.substring(1);
    
    let isWinner = false;
    let winAmount = 0;
    let winType = '';
    let matchedNumber = '';
    
    switch(bet.type) {
        case 'borlette':
        case 'boulpe':
            if (bet.number === lot1Last2) {
                isWinner = true;
                winAmount = bet.amount * 60;
                winType = '1er lot';
                matchedNumber = lot1Last2;
            } else if (bet.number === lot2) {
                isWinner = true;
                winAmount = bet.amount * 20;
                winType = '2e lot';
                matchedNumber = lot2;
            } else if (bet.number === lot3) {
                isWinner = true;
                winAmount = bet.amount * 10;
                winType = '3e lot';
                matchedNumber = lot3;
            }
            break;
            
        case 'lotto3':
            if (bet.number === lot1) {
                isWinner = true;
                winAmount = bet.amount * 500;
                winType = 'Lotto 3';
                matchedNumber = lot1;
            }
            break;
            
        case 'lotto4':
            winAmount = 0;
            winType = '';
            
            if (bet.options?.option1) {
                const option1Result = lot2 + lot3;
                if (bet.number === option1Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 5000;
                    winType += 'Opsyon 1, ';
                    matchedNumber = option1Result;
                }
            }
            
            if (bet.options?.option2) {
                const option2Result = lot1.substring(1) + lot2;
                if (bet.number === option2Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 5000;
                    winType += 'Opsyon 2, ';
                    matchedNumber = option2Result;
                }
            }
            
            if (bet.options?.option3) {
                const betDigits = bet.number.split('');
                const lot2Digits = lot2.split('');
                const lot3Digits = lot3.split('');
                
                const tempDigits = [...betDigits];
                let containsLot2 = true;
                let containsLot3 = true;
                
                for (const digit of lot2Digits) {
                    const index = tempDigits.indexOf(digit);
                    if (index === -1) {
                        containsLot2 = false;
                        break;
                    }
                    tempDigits.splice(index, 1);
                }
                
                for (const digit of lot3Digits) {
                    const index = tempDigits.indexOf(digit);
                    if (index === -1) {
                        containsLot3 = false;
                        break;
                    }
                    tempDigits.splice(index, 1);
                }
                
                if (containsLot2 && containsLot3) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 5000;
                    winType += 'Opsyon 3, ';
                    matchedNumber = bet.number;
                }
            }
            break;
            
        case 'lotto5':
            winAmount = 0;
            winType = '';
            
            if (bet.options?.option1) {
                const option1Result = lot1 + lot2;
                if (bet.number === option1Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 25000;
                    winType += 'Opsyon 1, ';
                    matchedNumber = option1Result;
                }
            }
            
            if (bet.options?.option2) {
                const option2Result = lot1 + lot3;
                if (bet.number === option2Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 25000;
                    winType += 'Opsyon 2, ';
                    matchedNumber = option2Result;
                }
            }
            
            if (bet.options?.option3) {
                const allResultDigits = (lot1 + lot2 + lot3).split('');
                const betDigits = bet.number.split('');
                
                let allFound = true;
                const tempResultDigits = [...allResultDigits];
                
                for (const digit of betDigits) {
                    const index = tempResultDigits.indexOf(digit);
                    if (index === -1) {
                        allFound = false;
                        break;
                    }
                    tempResultDigits.splice(index, 1);
                }
                
                if (allFound) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 25000;
                    winType += 'Opsyon 3, ';
                    matchedNumber = bet.number;
                }
            }
            break;
            
        case 'marriage':
        case 'auto-marriage':
            const [num1, num2] = bet.number.split('*');
            const numbers = [lot1Last2, lot2, lot3];
            
            if (numbers.includes(num1) && numbers.includes(num2)) {
                isWinner = true;
                winAmount = bet.amount * 1000;
                winType = 'Maryaj';
                matchedNumber = `${num1}*${num2}`;
            }
            break;
            
        case 'grap':
            if (lot1[0] === lot1[1] && lot1[1] === lot1[2]) {
                if (bet.number === lot1) {
                    isWinner = true;
                    winAmount = bet.amount * 500;
                    winType = 'Grap';
                    matchedNumber = lot1;
                }
            }
            break;
            
        case 'auto-lotto4':
            const lotto4Digits = bet.number.split('');
            const autoLot2Digits = lot2.split('');
            const autoLot3Digits = lot3.split('');
            
            const autoTempDigits = [...lotto4Digits];
            let autoContainsLot2 = true;
            let autoContainsLot3 = true;
            
            for (const digit of autoLot2Digits) {
                const index = autoTempDigits.indexOf(digit);
                if (index === -1) {
                    autoContainsLot2 = false;
                    break;
                }
                autoTempDigits.splice(index, 1);
            }
            
            for (const digit of autoLot3Digits) {
                const index = autoTempDigits.indexOf(digit);
                if (index === -1) {
                    autoContainsLot3 = false;
                    break;
                }
                autoTempDigits.splice(index, 1);
            }
            
            if (autoContainsLot2 && autoContainsLot3) {
                isWinner = true;
                winAmount = bet.amount * 5000;
                winType = 'Lotto 4 Auto';
                matchedNumber = bet.number;
            }
            break;
    }
    
    return { isWinner, winAmount, winType, matchedNumber };
}

// Récupérer les informations de l'entreprise
app.get('/api/company-info', async (req, res) => {
    try {
        let companyInfo = await Company.findOne().sort({ updatedAt: -1 });
        
        if (!companyInfo) {
            // Créer des informations par défaut
            companyInfo = await Company.create({
                name: "Nova Lotto",
                phone: "+509 32 53 49 58",
                address: "Cap Haïtien",
                logoUrl: "logo-borlette.jpg",
                reportTitle: "Nova Lotto",
                reportPhone: "40104585"
            });
        }
        
        res.json({ success: true, companyInfo });
    } catch (error) {
        console.error('Error fetching company info:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// === ROUTES PWA ===

// Route spéciale pour l'installation PWA
app.get('/install', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Installer Lotato System</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    margin: 0;
                }
                .container {
                    background: white;
                    padding: 2rem;
                    border-radius: 10px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    text-align: center;
                    max-width: 400px;
                }
                h1 {
                    color: #333;
                    margin-bottom: 1rem;
                }
                p {
                    color: #666;
                    margin-bottom: 2rem;
                }
                .btn {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 5px;
                    font-size: 16px;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-block;
                    transition: background 0.3s;
                }
                .btn:hover {
                    background: #5a67d8;
                }
                .instructions {
                    margin-top: 2rem;
                    text-align: left;
                    background: #f7f7f7;
                    padding: 1rem;
                    border-radius: 5px;
                    font-size: 14px;
                }
                ol {
                    padding-left: 1.5rem;
                }
                li {
                    margin-bottom: 0.5rem;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📱 Installer Lotato System</h1>
                <p>Installez cette application sur votre appareil pour un accès rapide et hors ligne.</p>
                
                <a href="/" class="btn">Ouvrir l'application</a>
                
                <div class="instructions">
                    <strong>Pour installer :</strong>
                    <ol>
                        <li>Ouvrez l'application</li>
                        <li>Sur mobile : appuyez sur "⋮" (menu) → "Installer l'application"</li>
                        <li>Sur iOS : appuyez sur "Partager" → "Sur l'écran d'accueil"</li>
                        <li>Suivez les instructions pour terminer l'installation</li>
                    </ol>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Route pour vérifier l'installabilité PWA
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(__dirname, 'manifest.json'));
});

// Route pour le service worker
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(path.join(__dirname, 'sw.js'));
});

// Endpoint de santé
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'online', 
        timestamp: new Date().toISOString(),
        mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        pwa: true,
        installable: true,
        compression: true
    });
});

// === ROUTES PAGES ===

// Page login
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Pages protégées
const pagesProtegees = [
    { url: '/lotato.html', file: 'lotato.html' },
    { url: '/control-level1.html', file: 'control-level1.html' },
    { url: '/control-level2.html', file: 'control-level2.html' },
    { url: '/subsystem-admin.html', file: 'subsystem-admin.html' },
    { url: '/master-dashboard.html', file: 'master-dashboard.html' }
];

pagesProtegees.forEach(page => {
    app.get(page.url, requireAuth, (req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(path.join(__dirname, page.file));
    });
});

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Page non trouvée - Lotato</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    text-align: center;
                    padding: 50px;
                    background: #f5f5f5;
                }
                .container {
                    background: white;
                    padding: 40px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    display: inline-block;
                }
                h1 {
                    color: #e74c3c;
                    font-size: 48px;
                }
                a {
                    color: #3498db;
                    text-decoration: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>404</h1>
                <h2>Page non trouvée</h2>
                <p>La page que vous recherchez n'existe pas.</p>
                <p><a href="/">Retour à l'accueil</a></p>
            </div>
        </body>
        </html>
    `);
});

// === DÉMARRAGE ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur LOTATO démarré sur le port ${PORT}`);
    console.log(`🔗 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connecté' : '❌ Non connecté'}`);
    console.log(`📱 PWA Installable: ✅ Oui (accédez à /install pour instructions)`);
    console.log(`💾 Compression: ✅ Activée`);
    console.log(`🌐 URL d'installation: http://localhost:${PORT}/install`);
});