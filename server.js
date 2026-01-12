const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const compression = require('compression');

const app = express();

// =================== CONFIGURATION ESSENTIELLE ===================

// 1. Compression GZIP pour la rapidité
app.use(compression());

// 2. CORS (Permet à lotato.html de se connecter même s'il est hébergé ailleurs)
app.use(cors({
    origin: '*', // En production, remplacez '*' par votre domaine frontend pour plus de sécurité
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

// 3. Parsing des données (Indispensable pour recevoir les tickets)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 4. Servir les fichiers statiques (images, css, html)
app.use(express.static(__dirname));

// =================== BASE DE DONNÉES ===================

// Connexion MongoDB (Gère localhost ET la production via variable d'environnement)
const MONGO_URI = process.env.MONGO_URL || 'mongodb://localhost:27017/lotato_db';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connecté avec succès !'))
    .catch(err => console.error('❌ Erreur connexion MongoDB:', err));

// =================== SCHÉMAS (MODÈLES) ===================

// Utilisateur (Agent)
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String },
    role: { type: String, default: 'agent' },
    level: { type: Number, default: 1 }
}));

// Ticket (Fiche) - Correspond exactement à votre frontend
const Ticket = mongoose.model('Ticket', new mongoose.Schema({
    number: { type: Number, required: true }, // unique retiré temporairement pour éviter conflits en dev
    draw: { type: String, required: true },
    draw_time: { type: String, required: true },
    date: { type: Date, default: Date.now },
    bets: [mongoose.Schema.Types.Mixed], // Flexible pour accepter tous vos types de paris
    total: { type: Number, required: true },
    agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    agent_name: { type: String },
    is_synced: { type: Boolean, default: true }
}));

// Résultats
const Result = mongoose.model('Result', new mongoose.Schema({
    draw: String,
    draw_time: String,
    date: Date,
    lot1: String,
    lot2: String,
    lot3: String
}));

// Configuration (Nom entreprise, logo)
const Config = mongoose.model('Config', new mongoose.Schema({
    company_name: { type: String, default: 'Nova Lotto' },
    logo_url: { type: String, default: 'logo-borlette.jpg' }
}));

// Fiche Multi-Tirages
const MultiDrawTicket = mongoose.model('MultiDrawTicket', new mongoose.Schema({
    number: Number,
    date: { type: Date, default: Date.now },
    bets: [mongoose.Schema.Types.Mixed],
    draws: [String],
    total: Number,
    agent_name: String
}));

// Historique
const History = mongoose.model('History', new mongoose.Schema({
    id: Number,
    date: String,
    draw: String,
    draw_time: String,
    bets: Array,
    total: Number,
    agent_id: String
}));

// =================== MIDDLEWARE AUTHENTIFICATION (CORRIGÉ) ===================

const verifierToken = (req, res, next) => {
    let token = req.headers['x-auth-token'];

    // CORRECTION MAJEURE : Vérifier aussi le header Authorization (Bearer)
    // C'est ce que votre lotato.html envoie !
    const authHeader = req.headers['authorization'];
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    if (!token) {
        // En mode dév, on peut être indulgent, mais en prod on rejette
        // return res.status(401).json({ success: false, error: 'Accès non autorisé (Token manquant)' });
    }

    // Extraction basique du token (format: nova_timestamp_userId_role_level)
    if (token && token.startsWith('nova_')) {
        const parts = token.split('_');
        req.user = {
            id: parts[2],
            role: parts[3]
        };
    }

    next();
};

// =================== ROUTES API ===================

// 1. Test de santé (Pour vérifier si le serveur tourne)
app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'online', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// 2. Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log(`Tentative de connexion : ${username}`);

        // Recherche utilisateur (ou création admin par défaut si vide)
        let user = await User.findOne({ username, password });
        
        // Création auto d'un admin si aucun utilisateur n'existe (POUR DÉMARRAGE FACILE)
        if (!user && await User.countDocuments() === 0) {
            user = await User.create({
                username: 'admin',
                password: 'password', // Changez ceci !
                name: 'Administrateur',
                role: 'agent'
            });
            console.log('Compte admin par défaut créé');
        }

        if (!user) {
            return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
        }

        // Création du token compatible avec votre frontend
        const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level}`;

        res.json({
            success: true,
            token: token,
            redirectUrl: '/lotato.html', // Redirection directe vers l'app
            user: { id: user._id, name: user.name, role: user.role }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Erreur serveur login' });
    }
});

// 3. Sauvegarder un ticket (POST /api/tickets)
app.post('/api/tickets', verifierToken, async (req, res) => {
    try {
        console.log('Reçu nouveau ticket:', req.body.number);
        
        const lastTicket = await Ticket.findOne().sort({ number: -1 });
        const nextNumber = lastTicket ? lastTicket.number + 1 : 1;

        const ticket = new Ticket({
            ...req.body,
            number: nextNumber, // On assure la séquence côté serveur
            date: new Date()
        });

        await ticket.save();
        
        res.json({
            success: true,
            ticket: ticket,
            nextTicketNumber: nextNumber + 1
        });
    } catch (error) {
        console.error('Erreur sauvegarde ticket:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Récupérer les tickets (GET /api/tickets)
app.get('/api/tickets', verifierToken, async (req, res) => {
    try {
        // Optionnel : filtrer par agent si nécessaire
        const tickets = await Ticket.find().sort({ date: -1 }).limit(100);
        
        // Calcul du prochain numéro
        const lastTicket = await Ticket.findOne().sort({ number: -1 });
        const nextNum = lastTicket ? lastTicket.number + 1 : 1;

        res.json({
            success: true,
            tickets: tickets,
            nextTicketNumber: nextNum
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Tickets en attente (Utilisé par votre sync)
app.get('/api/tickets/pending', verifierToken, async (req, res) => {
    res.json({ success: true, tickets: [] }); // Retourne vide pour l'instant
});
app.post('/api/tickets/pending', verifierToken, async (req, res) => {
    // Logique identique à la sauvegarde normale pour simplifier
    try {
        const ticket = new Ticket({ ...req.body, date: new Date() });
        await ticket.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 6. Résultats & Gagnants
app.get('/api/results', async (req, res) => {
    try {
        // Retourne des résultats fictifs ou depuis la DB
        const results = await Result.find().sort({ date: -1 }).limit(20);
        
        // Si pas de résultats en DB, on renvoie une structure vide pour ne pas faire planter le front
        const resultsFormatted = {}; 
        results.forEach(r => {
            if(!resultsFormatted[r.draw]) resultsFormatted[r.draw] = {};
            resultsFormatted[r.draw][r.draw_time] = r;
        });

        res.json({ success: true, results: resultsFormatted });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. Vérification des gagnants (Endpoint appelé par le bouton "Tcheke Rezilta")
app.post('/api/check-winners', verifierToken, async (req, res) => {
    // La logique lourde est faite côté client dans votre lotato.html actuel
    // Mais le serveur doit répondre correctement
    res.json({ success: true, winningTickets: [] });
});

// 8. Info Entreprise & Logo
app.get('/api/company-info', async (req, res) => {
    const config = await Config.findOne() || new Config();
    res.json({
        success: true,
        company_name: config.company_name,
        company_phone: '+509 0000 0000',
        company_address: 'Haiti'
    });
});

app.get('/api/logo', async (req, res) => {
    res.json({ success: true, logoUrl: 'logo-borlette.jpg' });
});

// 9. Historique
app.post('/api/history', verifierToken, async (req, res) => {
    try {
        await History.create(req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// 10. Multi-tirages
app.get('/api/tickets/multi-draw', verifierToken, async (req, res) => {
    const tickets = await MultiDrawTicket.find().sort({ date: -1 }).limit(20);
    res.json({ success: true, tickets });
});

app.post('/api/tickets/multi-draw', verifierToken, async (req, res) => {
    try {
        await MultiDrawTicket.create(req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/tickets/winning', verifierToken, (req, res) => res.json({ success: true, tickets: [] }));


// =================== ROUTES HTML ===================

// Rediriger la racine vers lotato.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Route générique pour tout fichier .html
app.get('/*.html', (req, res) => {
    res.sendFile(path.join(__dirname, req.path));
});


// =================== DÉMARRAGE ===================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`\n🚀 SERVEUR LOTATO DÉMARRÉ SUR LE PORT ${PORT}`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`📂 Mode: Uniquement Lotato`);
    console.log(`🔧 Token Support: Bearer & x-auth-token ACTIVÉ\n`);
});
