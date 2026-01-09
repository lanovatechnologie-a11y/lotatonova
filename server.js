const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(compression());
app.use(cookieParser());
app.use(cors({
    origin: ['http://localhost:3000', 'https://lotato-frontend.onrender.com'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques
app.use(express.static(__dirname));

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
    subsystemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
    assignedSubsystems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' }],
    createdAt: { type: Date, default: Date.now }
});

// Schéma sous-système
const subsystemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true }, // Ex: 'pap', 'cap', 'delmas'
    domain: { type: String, required: true }, // Sous-domaine
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    maxUsers: { type: Number, default: 50 },
    isActive: { type: Boolean, default: true },
    config: {
        openingTime: { type: String, default: '08:00' },
        closingTime: { type: String, default: '22:00' },
        allowedGames: { type: [String], default: ['borlette', 'boulpe', 'lotto3', 'lotto4'] },
        multipliers: {
            borlette: { type: Number, default: 60 },
            boulpe: { type: Number, default: 60 },
            lotto3: { type: Number, default: 500 },
            lotto4: { type: Number, default: 5000 }
        }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
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
    subsystemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
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
    subsystemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
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
    subsystemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
    action: { type: String, required: true },
    details: { type: Object },
    ipAddress: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now }
});

// Modèles
const User = mongoose.model('User', userSchema);
const Subsystem = mongoose.model('Subsystem', subsystemSchema);
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
        // Récupérer le token des cookies ou de l'URL
        const token = req.cookies.nova_token || 
                     req.headers.authorization?.split(' ')[1] ||
                     req.query.token;
        
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

// Middleware pour vérifier les permissions de sous-système
async function requireSubsystemAccess(req, res, next) {
    try {
        const user = req.user;
        const subsystemId = req.params.id || req.body.subsystemId || req.query.subsystemId;
        
        // Le master a accès à tout
        if (user.role === 'master') {
            return next();
        }
        
        // L'admin de sous-système a accès à son propre sous-système
        if (user.role === 'subsystem') {
            if (user.subsystemId && user.subsystemId.toString() === subsystemId) {
                return next();
            }
        }
        
        // Vérifier si l'utilisateur a accès via assignedSubsystems
        if (user.assignedSubsystems && user.assignedSubsystems.some(id => id.toString() === subsystemId)) {
            return next();
        }
        
        return res.status(403).json({ 
            success: false, 
            error: 'Accès interdit à ce sous-système' 
        });
    } catch (error) {
        console.error('Subsystem access error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur vérification des permissions' 
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
                subsystemId: req.user.subsystemId,
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

        // Comparer le mot de passe (non hashé pour compatibilité)
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
                name: user.name,
                subsystemId: user.subsystemId
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
                commissionRate: user.commissionRate,
                subsystemId: user.subsystemId
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
        const token = req.cookies.nova_token || 
                     req.headers.authorization?.split(' ')[1] ||
                     req.query.token;

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
                commissionRate: user.commissionRate,
                subsystemId: user.subsystemId
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

// === ROUTES SOUS-SYSTÈMES ===

// Récupérer tous les sous-systèmes (master seulement)
app.get('/api/subsystems', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'master') {
            return res.status(403).json({ 
                success: false, 
                error: 'Accès réservé au master' 
            });
        }
        
        const subsystems = await Subsystem.find({})
            .populate('managerId', 'name username')
            .sort({ createdAt: -1 });
        
        res.json({ success: true, subsystems });
    } catch (error) {
        console.error('Error fetching subsystems:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer les sous-systèmes d'un utilisateur
app.get('/api/subsystems/my-subsystems', requireAuth, async (req, res) => {
    try {
        let subsystems = [];
        
        if (req.user.role === 'master') {
            // Le master voit tous les sous-systèmes
            subsystems = await Subsystem.find({ isActive: true })
                .populate('managerId', 'name username');
        } else if (req.user.role === 'subsystem') {
            // L'admin de sous-système voit son propre sous-système
            subsystems = await Subsystem.find({ 
                $or: [
                    { managerId: req.user._id },
                    { _id: req.user.subsystemId }
                ],
                isActive: true 
            }).populate('managerId', 'name username');
        } else if (req.user.assignedSubsystems && req.user.assignedSubsystems.length > 0) {
            // Les autres voient leurs sous-systèmes assignés
            subsystems = await Subsystem.find({ 
                _id: { $in: req.user.assignedSubsystems },
                isActive: true 
            }).populate('managerId', 'name username');
        }
        
        res.json({ success: true, subsystems });
    } catch (error) {
        console.error('Error fetching user subsystems:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer un sous-système par ID
app.get('/api/subsystems/:id', requireAuth, requireSubsystemAccess, async (req, res) => {
    try {
        const subsystem = await Subsystem.findById(req.params.id)
            .populate('managerId', 'name username email');
        
        if (!subsystem) {
            return res.status(404).json({ 
                success: false, 
                error: 'Sous-système non trouvé' 
            });
        }
        
        res.json({ success: true, subsystem });
    } catch (error) {
        console.error('Error fetching subsystem:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Créer un sous-système (master seulement)
app.post('/api/subsystems', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'master') {
            return res.status(403).json({ 
                success: false, 
                error: 'Accès réservé au master' 
            });
        }
        
        const { name, code, domain, managerId, maxUsers, config } = req.body;
        
        // Vérifier si le manager existe
        const manager = await User.findById(managerId);
        if (!manager) {
            return res.status(404).json({ 
                success: false, 
                error: 'Manager non trouvé' 
            });
        }
        
        // Créer le sous-système
        const subsystem = new Subsystem({
            name,
            code,
            domain,
            managerId,
            maxUsers: maxUsers || 50,
            config: config || {
                openingTime: '08:00',
                closingTime: '22:00',
                allowedGames: ['borlette', 'boulpe', 'lotto3', 'lotto4'],
                multipliers: {
                    borlette: 60,
                    boulpe: 60,
                    lotto3: 500,
                    lotto4: 5000
                }
            }
        });
        
        await subsystem.save();
        
        // Mettre à jour le rôle du manager
        manager.role = 'subsystem';
        manager.subsystemId = subsystem._id;
        await manager.save();
        
        res.json({ 
            success: true, 
            subsystem,
            message: 'Sous-système créé avec succès'
        });
        
    } catch (error) {
        console.error('Error creating subsystem:', error);
        if (error.code === 11000) {
            return res.status(400).json({ 
                success: false, 
                error: 'Code ou domaine déjà utilisé' 
            });
        }
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Mettre à jour un sous-système
app.put('/api/subsystems/:id', requireAuth, requireSubsystemAccess, async (req, res) => {
    try {
        const { name, config, maxUsers, isActive } = req.body;
        
        const subsystem = await Subsystem.findById(req.params.id);
        if (!subsystem) {
            return res.status(404).json({ 
                success: false, 
                error: 'Sous-système non trouvé' 
            });
        }
        
        // Mettre à jour les champs
        if (name) subsystem.name = name;
        if (config) subsystem.config = { ...subsystem.config, ...config };
        if (maxUsers !== undefined) subsystem.maxUsers = maxUsers;
        if (isActive !== undefined) subsystem.isActive = isActive;
        
        subsystem.updatedAt = new Date();
        await subsystem.save();
        
        res.json({ 
            success: true, 
            subsystem,
            message: 'Sous-système mis à jour avec succès'
        });
        
    } catch (error) {
        console.error('Error updating subsystem:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer les utilisateurs d'un sous-système
app.get('/api/subsystems/:id/users', requireAuth, requireSubsystemAccess, async (req, res) => {
    try {
        const users = await User.find({ 
            $or: [
                { subsystemId: req.params.id },
                { assignedSubsystems: req.params.id }
            ],
            isActive: true
        }).select('-password');
        
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching subsystem users:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Ajouter un utilisateur à un sous-système
app.post('/api/subsystems/:id/users', requireAuth, requireSubsystemAccess, async (req, res) => {
    try {
        const { userId, role } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'Utilisateur non trouvé' 
            });
        }
        
        // Vérifier la limite d'utilisateurs
        const subsystem = await Subsystem.findById(req.params.id);
        const userCount = await User.countDocuments({ 
            $or: [
                { subsystemId: req.params.id },
                { assignedSubsystems: req.params.id }
            ]
        });
        
        if (userCount >= subsystem.maxUsers) {
            return res.status(400).json({ 
                success: false, 
                error: `Limite d'utilisateurs atteinte (${subsystem.maxUsers})` 
            });
        }
        
        // Ajouter l'utilisateur au sous-système
        if (role === 'manager') {
            user.subsystemId = subsystem._id;
            user.role = 'subsystem';
        } else {
            // Ajouter aux sous-systèmes assignés
            if (!user.assignedSubsystems.includes(subsystem._id)) {
                user.assignedSubsystems.push(subsystem._id);
            }
        }
        
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'Utilisateur ajouté au sous-système',
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                role: user.role
            }
        });
        
    } catch (error) {
        console.error('Error adding user to subsystem:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
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
            subsystemId: req.user.subsystemId,
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
            subsystemId: req.user.subsystemId,
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

// Récupérer les fiches d'un sous-système
app.get('/api/subsystems/:id/tickets', requireAuth, requireSubsystemAccess, async (req, res) => {
    try {
        const { startDate, endDate, status } = req.query;
        
        let query = { subsystemId: req.params.id };
        
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
            .populate('agentId', 'name username')
            .sort({ createdAt: -1 })
            .limit(200);
        
        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Error fetching subsystem tickets:', error);
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
                    subsystemId: ticket.subsystemId,
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

// Récupérer les statistiques d'un sous-système
app.get('/api/subsystems/:id/stats', requireAuth, requireSubsystemAccess, async (req, res) => {
    try {
        const today = new Date();
        const startOfToday = new Date(today.setHours(0, 0, 0, 0));
        const endOfToday = new Date(today.setHours(23, 59, 59, 999));
        
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
        
        // Tickets du jour
        const todayTickets = await Ticket.countDocuments({
            subsystemId: req.params.id,
            createdAt: { $gte: startOfToday, $lte: endOfToday }
        });
        
        // Ventes du jour
        const todaySales = await Ticket.aggregate([
            { $match: { 
                subsystemId: mongoose.Types.ObjectId(req.params.id),
                createdAt: { $gte: startOfToday, $lte: endOfToday },
                status: { $in: ['pending', 'synced'] }
            }},
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        
        // Ventes du mois
        const monthSales = await Ticket.aggregate([
            { $match: { 
                subsystemId: mongoose.Types.ObjectId(req.params.id),
                createdAt: { $gte: startOfMonth, $lte: endOfMonth },
                status: { $in: ['pending', 'synced'] }
            }},
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        
        // Tickets du mois
        const monthTickets = await Ticket.countDocuments({
            subsystemId: req.params.id,
            createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        });
        
        // Utilisateurs actifs
        const activeUsers = await User.countDocuments({
            $or: [
                { subsystemId: req.params.id },
                { assignedSubsystems: req.params.id }
            ],
            isActive: true
        });
        
        // Gagnants du mois
        const monthWinners = await WinningTicket.aggregate([
            { $match: { 
                subsystemId: mongoose.Types.ObjectId(req.params.id),
                createdAt: { $gte: startOfMonth, $lte: endOfMonth }
            }},
            { $group: { _id: null, total: { $sum: '$totalWinnings' } } }
        ]);
        
        res.json({
            success: true,
            stats: {
                today: {
                    tickets: todayTickets,
                    sales: todaySales[0]?.total || 0
                },
                month: {
                    tickets: monthTickets,
                    sales: monthSales[0]?.total || 0,
                    winners: monthWinners[0]?.total || 0
                },
                users: activeUsers
            }
        });
        
    } catch (error) {
        console.error('Error fetching subsystem stats:', error);
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

// Mettre à jour les informations de l'entreprise
app.put('/api/company-info', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'master' && req.user.role !== 'subsystem') {
            return res.status(403).json({ 
                success: false, 
                error: 'Accès non autorisé' 
            });
        }
        
        const { name, phone, address, logoUrl, reportTitle, reportPhone, commissionRates } = req.body;
        
        let companyInfo = await Company.findOne().sort({ updatedAt: -1 });
        
        if (!companyInfo) {
            companyInfo = new Company({
                name,
                phone,
                address,
                logoUrl,
                reportTitle,
                reportPhone,
                commissionRates
            });
        } else {
            if (name) companyInfo.name = name;
            if (phone) companyInfo.phone = phone;
            if (address) companyInfo.address = address;
            if (logoUrl) companyInfo.logoUrl = logoUrl;
            if (reportTitle) companyInfo.reportTitle = reportTitle;
            if (reportPhone) companyInfo.reportPhone = reportPhone;
            if (commissionRates) companyInfo.commissionRates = commissionRates;
            
            companyInfo.updatedAt = new Date();
        }
        
        await companyInfo.save();
        
        res.json({ 
            success: true, 
            companyInfo,
            message: 'Informations mises à jour avec succès'
        });
        
    } catch (error) {
        console.error('Error updating company info:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Gérer les utilisateurs
app.post('/api/users', requireAuth, async (req, res) => {
    try {
        // Seuls master et subsystem peuvent créer des utilisateurs
        if (req.user.role !== 'master' && req.user.role !== 'subsystem') {
            return res.status(403).json({ 
                success: false, 
                error: 'Accès non autorisé' 
            });
        }
        
        const { username, password, name, role, commissionRate, subsystemId } = req.body;
        
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cet identifiant est déjà utilisé' 
            });
        }
        
        // Créer l'utilisateur
        const user = new User({
            username,
            password, // Note: Dans un environnement de production, il faudrait hasher le mot de passe
            name,
            role: role || 'agent',
            commissionRate: commissionRate || 10,
            subsystemId: subsystemId || req.user.subsystemId,
            isActive: true
        });
        
        await user.save();
        
        res.json({ 
            success: true, 
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                commissionRate: user.commissionRate
            },
            message: 'Utilisateur créé avec succès'
        });
        
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer tous les utilisateurs (pour l'admin)
app.get('/api/users', requireAuth, async (req, res) => {
    try {
        if (req.user.role !== 'master' && req.user.role !== 'subsystem') {
            return res.status(403).json({ 
                success: false, 
                error: 'Accès non autorisé' 
            });
        }
        
        let query = {};
        
        // Si c'est un admin de sous-système, ne voir que les utilisateurs de son sous-système
        if (req.user.role === 'subsystem') {
            query = {
                $or: [
                    { subsystemId: req.user.subsystemId },
                    { assignedSubsystems: req.user.subsystemId }
                ]
            };
        }
        
        const users = await User.find(query).select('-password');
        
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Endpoint de santé
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'online', 
        timestamp: new Date().toISOString(),
        mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// === ROUTES PAGES ===

// Page login
app.get('/', (req, res) => {
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
        res.sendFile(path.join(__dirname, page.file));
    });
});

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint non trouvé' });
});

// === DÉMARRAGE ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur LOTATO démarré sur le port ${PORT}`);
    console.log(`🔗 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connecté' : '❌ Non connecté'}`);
});