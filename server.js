const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const app = express();

// Middleware
app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques
app.use(express.static(__dirname));

// MongoDB
mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/lottodb', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ MongoDB error'));
db.once('open', () => {
    console.log('✅ MongoDB connected');
});

// Schéma utilisateur
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['agent', 'supervisor1', 'supervisor2', 'subsystem', 'master'],
        required: true
    },
    level: { type: Number, default: 1 },
    name: { type: String }
});

const User = mongoose.model('User', userSchema);

// === MIDDLEWARE D'AUTHENTIFICATION ===
async function requireAuth(req, res, next) {
    try {
        const token = req.cookies.nova_token;
        
        if (!token || !token.startsWith('nova_')) {
            return res.redirect('/');
        }
        
        // Extraire user ID
        const userId = token.split('_')[2];
        const user = await User.findById(userId);
        
        if (!user) {
            res.clearCookie('nova_token');
            return res.redirect('/');
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.clearCookie('nova_token');
        res.redirect('/');
    }
}

// === ROUTES AUTH ===

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role, level } = req.body;
        
        const user = await User.findOne({ username, password, role });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Identifiants incorrects'
            });
        }

        // Token simple
        const token = `nova_${Date.now()}_${user._id}`;

        // Cookie pour Render
        res.cookie('nova_token', token, {
            httpOnly: true,
            secure: true,
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'none',
            path: '/'
        });

        // Redirection
        let redirectUrl;
        switch (user.role) {
            case 'agent': redirectUrl = '/lotato.html'; break;
            case 'supervisor1': redirectUrl = '/control-level1.html'; break;
            case 'supervisor2': redirectUrl = '/control-level2.html'; break;
            case 'subsystem': redirectUrl = '/subsystem-admin.html'; break;
            case 'master': redirectUrl = '/master-dashboard.html'; break;
            default: redirectUrl = '/';
        }

        res.json({
            success: true,
            redirectUrl: redirectUrl,
            user: {
                id: user._id,
                username: user.username,
                name: user.name || user.username,
                role: user.role,
                level: user.level
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

// Verify token
app.post('/api/auth/verify-token', async (req, res) => {
    try {
        const token = req.cookies.nova_token;

        if (!token || !token.startsWith('nova_')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Non authentifié' 
            });
        }

        // Extraire user ID
        const userId = token.split('_')[2];
        const user = await User.findById(userId);
        
        if (!user) {
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
                name: user.name || user.username,
                role: user.role, 
                level: user.level 
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

// === DÉMARRAGE ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur sur le port ${PORT}`);
});