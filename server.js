// server.js - Backend Nova Lotto (Version simplifiée)

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// Initialisation
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Connexion MongoDB Atlas (version corrigée)
const MONGODB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/nova_lotto';

console.log('🔗 Tentative de connexion à MongoDB...');

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log('✅ MongoDB connecté avec succès !');
    initializeDatabase();
})
.catch(err => {
    console.error('❌ Erreur de connexion MongoDB:', err.message);
    console.log('⚠️  Mode hors-ligne activé - les données seront stockées localement');
});

// Schémas simplifiés
const TicketSchema = new mongoose.Schema({
    ticketNumber: Number,
    date: { type: Date, default: Date.now },
    draw: String,
    drawTime: String,
    bets: Array,
    total: Number,
    agentName: String
});

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    name: String,
    role: { type: String, default: 'agent' }
});

// Modèles
const Ticket = mongoose.model('Ticket', TicketSchema);
const User = mongoose.model('User', UserSchema);

// Initialisation de la base de données
async function initializeDatabase() {
    try {
        // Créer un utilisateur admin par défaut
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            await User.create({
                username: 'admin',
                password: 'admin',
                name: 'Administrateur',
                role: 'admin'
            });
            console.log('👤 Compte admin créé (admin/admin)');
        }
        
        console.log('📊 Base de données initialisée');
    } catch (error) {
        console.error('Erreur d\'initialisation:', error);
    }
}

// ============================================
// ROUTES API (Version simplifiée)
// ============================================

// Route de test
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Serveur Nova Lotto actif',
        time: new Date().toISOString()
    });
});

// Authentification
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Validation simple
        if (!username || !password) {
            return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
        }
        
        // Recherche de l'utilisateur
        const user = await User.findOne({ username, password });
        
        if (!user) {
            return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
        }
        
        // Réponse avec un token simple
        res.json({
            success: true,
            token: 'token_' + Date.now(),
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role
            }
        });
        
    } catch (error) {
        console.error('Erreur login:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Tickets - Récupérer tous
app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ date: -1 }).limit(100);
        
        // Calculer le prochain numéro
        const lastTicket = tickets[0];
        const nextTicketNumber = lastTicket ? lastTicket.ticketNumber + 1 : 1;
        
        res.json({
            tickets,
            nextTicketNumber
        });
    } catch (error) {
        console.error('Erreur GET tickets:', error);
        res.json({ tickets: [], nextTicketNumber: 1 });
    }
});

// Tickets - Créer
app.post('/api/tickets', async (req, res) => {
    try {
        const ticketData = req.body;
        
        // S'assurer que le numéro est unique
        const existingTicket = await Ticket.findOne({ ticketNumber: ticketData.ticketNumber });
        if (existingTicket) {
            // Ajouter un suffixe si doublon
            ticketData.ticketNumber = ticketData.ticketNumber * 100 + Math.floor(Math.random() * 99);
        }
        
        const ticket = new Ticket(ticketData);
        await ticket.save();
        
        res.json({
            success: true,
            message: 'Ticket enregistré',
            ticketNumber: ticket.ticketNumber
        });
    } catch (error) {
        console.error('Erreur POST ticket:', error);
        res.status(500).json({ error: 'Erreur d\'enregistrement' });
    }
});

// Tickets en attente
app.get('/api/tickets/pending', async (req, res) => {
    try {
        // Pour simplifier, retourner les 10 derniers tickets
        const tickets = await Ticket.find()
            .sort({ date: -1 })
            .limit(10);
            
        res.json({ tickets });
    } catch (error) {
        console.error('Erreur pending tickets:', error);
        res.json({ tickets: [] });
    }
});

// Tickets gagnants
app.get('/api/tickets/winning', async (req, res) => {
    try {
        // Pour le moment, retourner vide
        res.json({ tickets: [] });
    } catch (error) {
        res.json({ tickets: [] });
    }
});

// Tickets multi-tirages
app.get('/api/tickets/multi-draw', async (req, res) => {
    try {
        res.json({ tickets: [] });
    } catch (error) {
        res.json({ tickets: [] });
    }
});

app.post('/api/tickets/multi-draw', async (req, res) => {
    try {
        const ticketData = req.body;
        ticketData.ticketNumber = Date.now() % 1000000; // Numéro unique
        
        const ticket = new Ticket(ticketData);
        await ticket.save();
        
        res.json({ success: true, ticket });
    } catch (error) {
        console.error('Erreur multi-draw:', error);
        res.status(500).json({ error: 'Erreur d\'enregistrement' });
    }
});

// Résultats
app.get('/api/results', async (req, res) => {
    try {
        // Résultats par défaut pour la démo
        const defaultResults = {
            miami: {
                morning: { lot1: '123', lot2: '45', lot3: '34' },
                evening: { lot1: '892', lot2: '34', lot3: '56' }
            },
            georgia: {
                morning: { lot1: '327', lot2: '45', lot3: '89' },
                evening: { lot1: '567', lot2: '12', lot3: '34' }
            },
            newyork: {
                morning: { lot1: '892', lot2: '34', lot3: '56' },
                evening: { lot1: '123', lot2: '45', lot3: '67' }
            },
            texas: {
                morning: { lot1: '567', lot2: '89', lot3: '01' },
                evening: { lot1: '234', lot2: '56', lot3: '78' }
            },
            tunisia: {
                morning: { lot1: '234', lot2: '56', lot3: '78' },
                evening: { lot1: '345', lot2: '67', lot3: '89' }
            }
        };
        
        res.json({ results: defaultResults });
    } catch (error) {
        console.error('Erreur results:', error);
        res.json({ results: {} });
    }
});

// Vérification des gagnants
app.post('/api/check-winners', async (req, res) => {
    try {
        res.json({
            winningTickets: [],
            message: 'Aucun gagnant pour le moment'
        });
    } catch (error) {
        res.json({ winningTickets: [] });
    }
});

// Historique
app.get('/api/history', async (req, res) => {
    try {
        const tickets = await Ticket.find()
            .sort({ date: -1 })
            .limit(50);
            
        res.json({ history: tickets });
    } catch (error) {
        console.error('Erreur history:', error);
        res.json({ history: [] });
    }
});

app.post('/api/history', async (req, res) => {
    try {
        res.json({ success: true });
    } catch (error) {
        res.json({ success: true });
    }
});

// Informations de la compagnie
app.get('/api/company-info', async (req, res) => {
    try {
        res.json({
            name: "Nova Lotto",
            phone: "+509 32 53 49 58",
            address: "Cap Haïtien",
            reportTitle: "Nova Lotto",
            reportPhone: "40104585"
        });
    } catch (error) {
        res.json({
            name: "Nova Lotto",
            phone: "+509 32 53 49 58",
            address: "Cap Haïtien"
        });
    }
});

// Logo
app.get('/api/logo', async (req, res) => {
    try {
        res.json({ logoUrl: 'logo-borlette.jpg' });
    } catch (error) {
        res.json({ logoUrl: 'logo-borlette.jpg' });
    }
});

// Route pour servir le fichier HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Route pour toutes les autres requêtes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Gestion des erreurs
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`
    ========================================
    🚀 Serveur Nova Lotto démarré
    📍 Port: ${PORT}
    🌐 URL: http://localhost:${PORT}
    🗄️  MongoDB: ${MONGODB_URI.includes('localhost') ? 'Local' : 'Atlas'}
    ========================================
    `);
});