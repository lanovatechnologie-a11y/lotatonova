// server.js - Backend Nova Lotto

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// Initialisation de l'application
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connexion MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URL || 'mongodb://localhost:27017/nova_lotto';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Erreur de connexion MongoDB:'));
db.once('open', () => {
    console.log('✅ Connecté à MongoDB Atlas');
});

// Schémas MongoDB
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, default: 'Agent' },
    role: { type: String, default: 'agent' },
    createdAt: { type: Date, default: Date.now }
});

const TicketSchema = new mongoose.Schema({
    ticketNumber: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    draw: { type: String, required: true },
    drawTime: { type: String, required: true },
    bets: [
        {
            type: { type: String },
            name: { type: String },
            number: { type: String },
            amount: { type: Number },
            multiplier: { type: Number },
            options: { type: Object },
            isGroup: { type: Boolean, default: false },
            isAuto: { type: Boolean, default: false },
            details: { type: Array }
        }
    ],
    total: { type: Number, required: true },
    agentName: { type: String },
    agentId: { type: Number },
    isSynced: { type: Boolean, default: false },
    isWinner: { type: Boolean, default: false },
    winnings: { type: Number, default: 0 }
});

const ResultSchema = new mongoose.Schema({
    draw: { type: String, required: true },
    time: { type: String, required: true },
    date: { type: Date, default: Date.now },
    lot1: { type: String, required: true },
    lot2: { type: String, required: true },
    lot3: { type: String, required: true }
});

const MultiDrawTicketSchema = new mongoose.Schema({
    ticketNumber: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    bets: [
        {
            gameType: { type: String },
            name: { type: String },
            number: { type: String },
            amount: { type: Number },
            multiplier: { type: Number },
            draws: { type: Array }
        }
    ],
    draws: { type: Array },
    total: { type: Number, required: true },
    agentName: { type: String },
    agentId: { type: Number }
});

const CompanySchema = new mongoose.Schema({
    name: { type: String, default: 'Nova Lotto' },
    phone: { type: String, default: '+509 32 53 49 58' },
    address: { type: String, default: 'Cap Haïtien' },
    reportTitle: { type: String, default: 'Nova Lotto' },
    reportPhone: { type: String, default: '40104585' },
    logoUrl: { type: String, default: '' }
});

// Modèles
const User = mongoose.model('User', UserSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);
const Result = mongoose.model('Result', ResultSchema);
const MultiDrawTicket = mongoose.model('MultiDrawTicket', MultiDrawTicketSchema);
const Company = mongoose.model('Company', CompanySchema);

// Initialisation des données par défaut
async function initializeDefaultData() {
    try {
        // Vérifier si un admin existe
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            await User.create({
                username: 'admin',
                password: 'admin123',
                name: 'Administrateur',
                role: 'admin'
            });
            console.log('👑 Compte admin créé (admin/admin123)');
        }

        // Vérifier si la compagnie existe
        const companyExists = await Company.findOne();
        if (!companyExists) {
            await Company.create({});
            console.log('🏢 Informations de la compagnie initialisées');
        }

        // Vérifier si des résultats existent
        const resultsExist = await Result.findOne();
        if (!resultsExist) {
            // Créer des résultats par défaut
            const defaultResults = [
                { draw: 'miami', time: 'morning', lot1: '123', lot2: '45', lot3: '34' },
                { draw: 'miami', time: 'evening', lot1: '892', lot2: '34', lot3: '56' },
                { draw: 'georgia', time: 'morning', lot1: '327', lot2: '45', lot3: '89' },
                { draw: 'georgia', time: 'evening', lot1: '567', lot2: '12', lot3: '34' },
                { draw: 'newyork', time: 'morning', lot1: '892', lot2: '34', lot3: '56' },
                { draw: 'newyork', time: 'evening', lot1: '123', lot2: '45', lot3: '67' },
                { draw: 'texas', time: 'morning', lot1: '567', lot2: '89', lot3: '01' },
                { draw: 'texas', time: 'evening', lot1: '234', lot2: '56', lot3: '78' },
                { draw: 'tunisia', time: 'morning', lot1: '234', lot2: '56', lot3: '78' },
                { draw: 'tunisia', time: 'evening', lot1: '345', lot2: '67', lot3: '89' }
            ];
            await Result.insertMany(defaultResults);
            console.log('📊 Résultats par défaut créés');
        }
    } catch (error) {
        console.error('Erreur lors de l\'initialisation:', error);
    }
}

// Routes API

// Route de test
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Serveur Nova Lotto opérationnel',
        timestamp: new Date().toISOString()
    });
});

// Authentification
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username, password });
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Identifiant ou mot de passe incorrect' 
            });
        }
        
        // Générer un token simple
        const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Gestion des tickets
app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ date: -1 });
        const nextTicketNumber = tickets.length > 0 ? 
            Math.max(...tickets.map(t => t.ticketNumber)) + 1 : 1;
        
        res.json({
            tickets,
            nextTicketNumber
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/tickets', async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.json({ success: true, ticket });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/tickets/pending', async (req, res) => {
    try {
        const tickets = await Ticket.find({ isSynced: false }).sort({ date: -1 });
        res.json({ tickets });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/tickets/winning', async (req, res) => {
    try {
        const tickets = await Ticket.find({ isWinner: true }).sort({ date: -1 });
        res.json({ tickets });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Tickets multi-tirages
app.get('/api/tickets/multi-draw', async (req, res) => {
    try {
        const tickets = await MultiDrawTicket.find().sort({ date: -1 });
        res.json({ tickets });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/tickets/multi-draw', async (req, res) => {
    try {
        const ticket = new MultiDrawTicket(req.body);
        await ticket.save();
        res.json({ success: true, ticket });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Résultats
app.get('/api/results', async (req, res) => {
    try {
        const results = await Result.find().sort({ date: -1 });
        
        // Formater les résultats comme attendu par le frontend
        const formattedResults = {};
        results.forEach(result => {
            if (!formattedResults[result.draw]) {
                formattedResults[result.draw] = {};
            }
            formattedResults[result.draw][result.time] = {
                date: result.date,
                lot1: result.lot1,
                lot2: result.lot2,
                lot3: result.lot3
            };
        });
        
        res.json({ results: formattedResults });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/results', async (req, res) => {
    try {
        const result = new Result(req.body);
        await result.save();
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Vérification des gagnants
app.post('/api/check-winners', async (req, res) => {
    try {
        const { draw, time } = req.body;
        
        // Récupérer le résultat du tiraj
        const result = await Result.findOne({ draw, time }).sort({ date: -1 });
        
        if (!result) {
            return res.json({ 
                winningTickets: [], 
                message: 'Aucun résultat trouvé' 
            });
        }
        
        // Récupérer les tickets pour ce tiraj
        const tickets = await Ticket.find({ 
            draw, 
            drawTime: time,
            isWinner: false 
        });
        
        const winningTickets = [];
        
        // Vérifier chaque ticket (logique simplifiée)
        tickets.forEach(ticket => {
            // Ici, tu peux implémenter la logique de vérification
            // basée sur les règles du jeu
            const isWinner = checkTicketAgainstResult(ticket, result);
            
            if (isWinner) {
                winningTickets.push(ticket);
                // Marquer le ticket comme gagnant
                Ticket.findByIdAndUpdate(ticket._id, { 
                    isWinner: true,
                    winnings: calculateWinnings(ticket, result)
                });
            }
        });
        
        res.json({ 
            winningTickets,
            result,
            count: winningTickets.length
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Fonctions auxiliaires pour vérifier les gagnants
function checkTicketAgainstResult(ticket, result) {
    // Logique de vérification simplifiée
    // À adapter selon les règles exactes du jeu
    return false; // Temporaire
}

function calculateWinnings(ticket, result) {
    // Logique de calcul des gains
    return 0; // Temporaire
}

// Historique
app.get('/api/history', async (req, res) => {
    try {
        const history = await Ticket.find()
            .sort({ date: -1 })
            .limit(100);
        res.json({ history });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/history', async (req, res) => {
    try {
        // Cette route peut servir à sauvegarder l'historique
        // Pour l'instant, on utilise juste les tickets
        res.json({ success: true, message: 'Historique enregistré' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Informations de la compagnie
app.get('/api/company-info', async (req, res) => {
    try {
        const company = await Company.findOne();
        res.json(company || {});
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/company-info', async (req, res) => {
    try {
        let company = await Company.findOne();
        
        if (!company) {
            company = new Company(req.body);
        } else {
            Object.assign(company, req.body);
        }
        
        await company.save();
        res.json({ success: true, company });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Logo
app.get('/api/logo', async (req, res) => {
    try {
        const company = await Company.findOne();
        res.json({ 
            logoUrl: company?.logoUrl || 'logo-borlette.jpg' 
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour servir le fichier HTML principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Routes pour les fichiers statiques
app.use(express.static('.'));

// Middleware pour les routes non trouvées
app.use((req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

// Démarrer le serveur
app.listen(PORT, async () => {
    console.log(`🚀 Serveur Nova Lotto démarré sur le port ${PORT}`);
    
    // Initialiser les données par défaut
    await initializeDefaultData();
    
    console.log(`
    ========================================
    ✅ Serveur prêt à l'emploi
    📊 API disponible sur http://localhost:${PORT}
    🗄️  Base de données: MongoDB Atlas
    ========================================
    `);
});