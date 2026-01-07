const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');

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

// Middleware pour les cookies
app.use(cookieParser());

// Middleware standard
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve tous les fichiers statiques à la racine avec compression GZIP
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Connexion MongoDB
mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/lottodb', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Connexion MongoDB échouée'));
db.once('open', () => {
    console.log('✅ MongoDB connecté avec succès !');
});

// Schema utilisateur
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['agent', 'supervisor1', 'supervisor2', 'subsystem', 'master'],
        required: true
    },
    level: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// === ROUTE DE CONNEXION ===
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role, level } = req.body;
        
        // Rechercher l'utilisateur avec son rôle exact
        const user = await User.findOne({ 
            username,
            password,
            role
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Identifiants incorrects'
            });
        }

        // Vérifier le niveau si nécessaire
        if ((role === 'supervisor1' || role === 'supervisor2') && user.level !== level) {
            return res.status(401).json({
                success: false,
                error: 'Niveau de superviseur incorrect'
            });
        }

        // Générer un token
        const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level}`;

        // Déterminer la redirection en fonction du rôle exact
        let redirectUrl;
        switch (user.role) {
            case 'agent':
                redirectUrl = '/lotato.html';
                break;
            case 'supervisor1':
                redirectUrl = '/control-level1.html';
                break;
            case 'supervisor2':
                redirectUrl = '/control-level2.html';
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

        // Définir un cookie HttpOnly sécurisé
        res.cookie('nova_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000, // 1 jour
            sameSite: 'strict',
            path: '/'
        });

        res.json({
            success: true,
            redirectUrl: redirectUrl,
            token: token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                level: user.level
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

// === ROUTE DE VÉRIFICATION DE TOKEN ===
app.post('/api/auth/verify-token', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        let token = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }

        // Vérifier aussi le cookie
        if (!token && req.cookies.nova_token) {
            token = req.cookies.nova_token;
        }

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token non fourni' 
            });
        }
        
        if (!token.startsWith('nova_')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token invalide' 
            });
        }

        const parts = token.split('_');
        if (parts.length < 3) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token mal formé' 
            });
        }

        const userId = parts[2];
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Utilisateur non trouvé' 
            });
        }

        // Déterminer l'URL de redirection
        let redirectUrl;
        switch (user.role) {
            case 'agent':
                redirectUrl = '/lotato.html';
                break;
            case 'supervisor1':
                redirectUrl = '/control-level1.html';
                break;
            case 'supervisor2':
                redirectUrl = '/control-level2.html';
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

        res.json({ 
            success: true, 
            redirectUrl: redirectUrl,
            user: { 
                id: user._id, 
                username: user.username, 
                role: user.role, 
                level: user.level 
            } 
        });
    } catch (error) {
        console.error('Erreur vérification token:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la vérification du token' 
        });
    }
});

// === MIDDLEWARE DE VÉRIFICATION DE TOKEN ===
function verifierToken(req, res, next) {
    let token = null;

    // 1. Vérifier le cookie
    if (req.cookies.nova_token) {
        token = req.cookies.nova_token;
    }

    // 2. Vérifier l'en-tête Authorization
    if (!token) {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }

    // 3. Vérifier le paramètre d'URL
    if (!token) {
        token = req.query.token;
    }

    if (!token || !token.startsWith('nova_')) {
        // Vérifier si c'est une requête HTML
        const accept = req.headers.accept || '';
        if (accept.includes('html') || req.path.endsWith('.html')) {
            return res.redirect('/');
        }
        return res.status(401).json({ 
            success: false, 
            error: 'Token manquant ou invalide. Veuillez vous reconnecter.' 
        });
    }

    req.token = token;
    next();
}

// === ROUTE DE DÉCONNEXION ===
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('nova_token');
    res.json({ 
        success: true, 
        message: 'Déconnexion réussie' 
    });
});

// === ROUTES API ===

app.get('/api/system/stats', verifierToken, async (req, res) => {
    try {
        const stats = {
            activeAgents: await User.countDocuments({ role: 'agent' }),
            activeSupervisors1: await User.countDocuments({ role: 'supervisor1' }),
            activeSupervisors2: await User.countDocuments({ role: 'supervisor2' }),
            openTickets: 0,
            todaySales: 0,
            pendingTasks: 0
        };
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Erreur stats:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors du chargement des stats' 
        });
    }
});

app.get('/api/agents', verifierToken, async (req, res) => {
    try {
        const agents = await User.find({ role: 'agent' });
        res.json({ success: true, agents });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors du chargement des agents' 
        });
    }
});

app.post('/api/agents/create', verifierToken, async (req, res) => {
    try {
        const { username, password, role, level } = req.body;
        const newAgent = new User({
            username: username,
            password: password,
            role: role || 'agent',
            level: level || 1
        });
        await newAgent.save();
        res.json({ 
            success: true, 
            message: 'Agent créé avec succès' 
        });
    } catch (error) {
        console.error('Erreur création agent:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la création de l\'agent' 
        });
    }
});

// === ROUTES HTML ===

// Page principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Pages protégées avec vérification de token
const protectedPages = [
    '/control-level1.html',
    '/control-level2.html',
    '/master-dashboard.html',
    '/subsystem-admin.html',
    '/lotato.html'
];

protectedPages.forEach(page => {
    app.get(page, verifierToken, (req, res) => {
        res.sendFile(path.join(__dirname, page));
    });
});

// === MIDDLEWARE DE GESTION D'ERREURS ===
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    res.status(500).json({
        success: false,
        error: 'Erreur serveur interne'
    });
});

// === DÉMARRAGE DU SERVEUR ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📁 Compression GZIP activée`);
    console.log(`🍪 Cookie-parser activé`);
    console.log(`🔐 Authentification par cookies HttpOnly`);
});