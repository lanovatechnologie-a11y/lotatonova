const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');

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

        // Vérifier le niveau si nécessaire (pour superviseurs)
        if ((role === 'supervisor1' || role === 'supervisor2') && user.level !== level) {
            return res.status(401).json({
                success: false,
                error: 'Niveau de superviseur incorrect'
            });
        }

        // Générer un token
        const token = `nova_${Date.now()}_${user._id}_${user.role}`;

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
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token non fourni' 
            });
        }

        const token = authHeader.substring(7);
        
        // Vérifier la structure du token
        if (!token.startsWith('nova_')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token invalide' 
            });
        }

        // Extraire l'ID utilisateur du token
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

        // Token valide
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

// === MIDDLWARE DE VÉRIFICATION DE TOKEN ===
function verifierToken(req, res, next) {
    let token = null;

    // 1. Vérifier l'en-tête Authorization
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }

    // 2. Vérifier le paramètre d'URL
    if (!token) {
        token = req.query.token;
    }

    // 3. Vérifier le localStorage côté client (pas possible côté serveur)
    // Le client doit envoyer le token dans l'en-tête ou l'URL

    if (!token || !token.startsWith('nova_')) {
        // Si c'est une requête HTML, rediriger vers la page de connexion
        if (req.accepts('html')) {
            return res.redirect('/');
        }
        // Sinon, retourner une erreur JSON
        return res.status(401).json({ 
            success: false, 
            error: 'Token manquant ou invalide. Veuillez vous reconnecter.' 
        });
    }

    // Stocker le token dans la requête pour une utilisation ultérieure
    req.token = token;
    next();
}

// === ROUTES API AVEC COMPRESSION ===

// Route pour les statistiques du système
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

// Route pour les activités récentes
app.get('/api/activities/recent', verifierToken, async (req, res) => {
    try {
        const activities = [];
        res.json({ success: true, activities });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors du chargement des activités' 
        });
    }
});

// Route pour les agents
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

// Route pour créer un agent
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

// Route pour les tickets
app.get('/api/tickets', verifierToken, async (req, res) => {
    try {
        const tickets = [];
        res.json({ success: true, tickets });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors du chargement des tickets' 
        });
    }
});

// Route pour les rapports
app.get('/api/reports/generate', verifierToken, async (req, res) => {
    try {
        const { period } = req.query;
        const report = {
            period: period,
            monthlyPerformance: 85,
            ticketResolution: 92,
            activeAgents: await User.countDocuments({ role: 'agent' }),
            pendingTickets: 5
        };
        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la génération du rapport' 
        });
    }
});

// Route pour les paramètres
app.post('/api/system/settings', verifierToken, async (req, res) => {
    try {
        res.json({ 
            success: true, 
            message: 'Paramètres sauvegardés avec succès' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Erreur lors de la sauvegarde des paramètres' 
        });
    }
});

// === ROUTES HTML AVEC COMPRESSION ===
const fs = require('fs');

// 1. Page principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Sous-système (subsystem-admin.html)
app.get('/subsystem-admin.html', verifierToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

// 3. Autres pages avec contrôle token
app.get('/control-level1.html', verifierToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', verifierToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/master-dashboard.html', verifierToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

app.get('/lotato.html', verifierToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Page de secours si superviseur-control.html existe
app.get('/supervisor-control.html', verifierToken, (req, res) => {
    // Vérifier si le fichier existe
    const filePath = path.join(__dirname, 'supervisor-control.html');
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.status(404).send('Page non trouvée');
        }
        res.sendFile(filePath);
    });
});

// === MIDDLEWARE DE GESTION D'ERREURS ===
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    if (req.accepts('html')) {
        res.status(500).send(`
            <html>
                <body>
                    <h1>Erreur serveur</h1>
                    <p>Une erreur interne est survenue. Veuillez réessayer.</p>
                    <a href="/">Retour à la page de connexion</a>
                </body>
            </html>
        `);
    } else {
        res.status(500).json({
            success: false,
            error: 'Erreur serveur interne'
        });
    }
});

// === DÉMARRAGE DU SERVEUR ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📁 Compression GZIP activée`);
    console.log(`⚡ Application optimisée pour la performance`);
    console.log(`👥 Rôles supportés: agent, supervisor1, supervisor2, subsystem, master`);
});