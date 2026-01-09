const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(compression());
app.use(cookieParser());
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (path.extname(filePath) === '.html') {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lotato:lotato123@cluster0.mongodb.net/lotato?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err.message));

// Schéma utilisateur (compatible avec vos données)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['agent', 'supervisor1', 'supervisor2', 'subsystem', 'master'],
        default: 'agent'
    },
    level: { type: Number, default: 1 },
    commissionRate: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    dateCreation: { type: Date, default: Date.now }
});

// Schémas simplifiés pour production
const drawSchema = new mongoose.Schema({
    drawId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    times: {
        morning: { type: String, required: true },
        evening: { type: String, required: true }
    },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
});

const ticketSchema = new mongoose.Schema({
    ticketNumber: { type: String, required: true, unique: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    agentName: { type: String, required: true },
    drawId: { type: String, required: true },
    drawTime: { type: String, required: true },
    bets: [{
        type: { type: String, required: true },
        name: { type: String, required: true },
        number: { type: String, required: true },
        amount: { type: Number, required: true },
        multiplier: { type: Number, required: true }
    }],
    totalAmount: { type: Number, required: true },
    commissionAmount: { type: Number, default: 0 },
    netAmount: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'paid', 'cancelled'],
        default: 'pending'
    },
    printedDate: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

const resultSchema = new mongoose.Schema({
    drawId: { type: String, required: true },
    drawTime: { type: String, enum: ['morning', 'evening'], required: true },
    date: { type: Date, required: true },
    lot1: { type: String, required: true },
    lot2: { type: String, required: true },
    lot3: { type: String, required: true }
});

// Modèles
const User = mongoose.model('User', userSchema);
const Draw = mongoose.model('Draw', drawSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const Result = mongoose.model('Result', resultSchema);

// === MIDDLEWARE D'AUTHENTIFICATION ===
async function requireAuth(req, res, next) {
    try {
        const token = req.cookies.nova_token || 
                     req.headers.authorization?.split(' ')[1] ||
                     req.query.token;
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token manquant' 
            });
        }
        
        // Token simple format: nova_TIMESTAMP_USERID_ROLE_LEVEL
        const tokenParts = token.split('_');
        if (tokenParts.length < 4 || tokenParts[0] !== 'nova') {
            return res.status(401).json({ 
                success: false, 
                error: 'Token invalide' 
            });
        }
        
        const userId = tokenParts[2];
        const user = await User.findById(userId);
        
        if (!user || user.isActive === false) {
            res.clearCookie('nova_token');
            return res.status(401).json({ 
                success: false, 
                error: 'Utilisateur non trouvé ou inactif' 
            });
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.clearCookie('nova_token');
        return res.status(401).json({ 
            success: false, 
            error: 'Token invalide' 
        });
    }
}

// === ROUTES AUTH ===
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username });
        
        if (!user || user.password !== password) {
            return res.status(401).json({
                success: false,
                error: 'Identifiant ou mot de passe incorrect'
            });
        }

        if (user.isActive === false) {
            return res.status(401).json({
                success: false,
                error: 'Compte désactivé'
            });
        }

        // Générer token simple
        const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;

        // Déterminer la redirection
        let redirectUrl = '/';
        switch (user.role) {
            case 'agent': redirectUrl = '/lotato.html'; break;
            case 'supervisor1': redirectUrl = '/control-level1.html'; break;
            case 'supervisor2': redirectUrl = '/control-level2.html'; break;
            case 'subsystem': redirectUrl = '/subsystem-admin.html'; break;
            case 'master': redirectUrl = '/master-dashboard.html'; break;
        }

        // Mettre à jour dernière connexion
        user.lastLogin = new Date();
        await user.save();

        // Cookie
        res.cookie('nova_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        });

        res.json({
            success: true,
            redirectUrl,
            token,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level,
                commissionRate: user.commissionRate
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('nova_token');
    res.json({ success: true, message: 'Déconnexion réussie' });
});

app.post('/api/auth/verify', requireAuth, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user._id,
            username: req.user.username,
            name: req.user.name,
            role: req.user.role,
            level: req.user.level,
            commissionRate: req.user.commissionRate
        }
    });
});

// === ROUTES DONNÉES ===
app.get('/api/draws', async (req, res) => {
    try {
        const draws = await Draw.find({ isActive: true }).sort({ order: 1 });
        res.json({ success: true, draws });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/results', async (req, res) => {
    try {
        const { drawId, date } = req.query;
        let query = {};
        if (drawId) query.drawId = drawId;
        if (date) {
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);
            query.date = { $gte: start, $lte: end };
        }
        const results = await Result.find(query).sort({ date: -1 }).limit(50);
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/tickets', requireAuth, async (req, res) => {
    try {
        const { drawId, drawTime, bets, totalAmount } = req.body;
        
        if (!drawId || !drawTime || !bets || !totalAmount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Données manquantes' 
            });
        }
        
        // Générer numéro de fiche
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const count = await Ticket.countDocuments({
            createdAt: {
                $gte: new Date(today.setHours(0, 0, 0, 0))
            }
        });
        
        const ticketNumber = `NOVA-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;
        
        // Calcul commission
        const commissionRate = req.user.commissionRate || 10;
        const commissionAmount = totalAmount * (commissionRate / 100);
        const netAmount = totalAmount - commissionAmount;
        
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
            status: 'pending',
            printedDate: new Date()
        });
        
        await ticket.save();
        
        res.json({ 
            success: true, 
            ticket: {
                id: ticket._id,
                ticketNumber: ticket.ticketNumber,
                totalAmount: ticket.totalAmount,
                createdAt: ticket.createdAt
            }
        });
        
    } catch (error) {
        console.error('Save ticket error:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/tickets/my-tickets', requireAuth, async (req, res) => {
    try {
        const tickets = await Ticket.find({ agentId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ success: true, tickets });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/stats/daily', requireAuth, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const tickets = await Ticket.countDocuments({
            agentId: req.user._id,
            createdAt: { $gte: today, $lt: tomorrow }
        });
        
        const sales = await Ticket.aggregate([
            { $match: { 
                agentId: req.user._id,
                createdAt: { $gte: today, $lt: tomorrow }
            }},
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        
        res.json({
            success: true,
            stats: {
                ticketsToday: tickets,
                salesToday: sales[0]?.total || 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// === ROUTES PAGES ===
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/lotato.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

app.get('/control-level1.html', requireAuth, (req, res) => {
    if (req.user.role !== 'supervisor1' && req.user.role !== 'master') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', requireAuth, (req, res) => {
    if (req.user.role !== 'supervisor2' && req.user.role !== 'master') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/subsystem-admin.html', requireAuth, (req, res) => {
    if (req.user.role !== 'subsystem' && req.user.role !== 'master') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

app.get('/master-dashboard.html', requireAuth, (req, res) => {
    if (req.user.role !== 'master') {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'online',
        timestamp: new Date().toISOString(),
        mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// === DÉMARRAGE ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur le port ${PORT}`);
    console.log(`🔗 MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connecté' : '❌ Non connecté'}`);
});