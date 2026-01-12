const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Connexion MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://votre-utilisateur:votre-motdepasse@cluster0.mongodb.net/nova?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Erreur MongoDB:'));
db.once('open', () => {
    console.log('✅ Connecté à MongoDB Atlas');
});

// Schémas simplifiés
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    name: String,
    role: String,
    dateCreation: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema({
    number: Number,
    draw: String,
    drawTime: String,
    date: { type: Date, default: Date.now },
    bets: Array,
    total: Number,
    agentName: String
});

const User = mongoose.model('User', userSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);

// Routes API
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        // Recherche utilisateur
        const user = await User.findOne({ 
            username: username,
            password: password,
            role: role 
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Identifiants incorrects'
            });
        }

        // Générer token
        const token = `nova_${Date.now()}_${user._id}_${user.role}`;
        
        // URL de redirection
        let redirectUrl = '/lotato.html';
        if (role === 'master') redirectUrl = '/master-dashboard.html';
        if (role === 'subsystem') redirectUrl = '/subsystem-admin.html';
        if (role.startsWith('supervisor')) redirectUrl = '/supervisor-control.html';
        
        redirectUrl += `?token=${encodeURIComponent(token)}`;

        res.json({
            success: true,
            redirectUrl: redirectUrl,
            token: token,
            user: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Erreur login:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Routes pour Lotato
app.get('/api/draws', async (req, res) => {
    try {
        const draws = {
            miami: {
                name: "Miami (Florida)",
                times: { morning: "1:30 PM", evening: "9:50 PM" },
                countdown: "18 h 30 min"
            },
            georgia: {
                name: "Georgia",
                times: { morning: "12:30 PM", evening: "7:00 PM" },
                countdown: "17 h 29 min"
            },
            newyork: {
                name: "New York",
                times: { morning: "2:30 PM", evening: "8:00 PM" },
                countdown: "19 h 30 min"
            },
            texas: {
                name: "Texas",
                times: { morning: "12:00 PM", evening: "6:00 PM" },
                countdown: "18 h 27 min"
            },
            tunisia: {
                name: "Tunisie",
                times: { morning: "10:30 AM", evening: "2:00 PM" },
                countdown: "8 h 30 min"
            }
        };
        
        res.json({ success: true, draws: draws });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur chargement tirages' });
    }
});

app.post('/api/tickets', async (req, res) => {
    try {
        const { draw, drawTime, bets, agentName } = req.body;
        
        // Trouver dernier numéro
        const lastTicket = await Ticket.findOne().sort({ number: -1 });
        const ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;
        
        // Calculer total
        const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
        
        const ticket = new Ticket({
            number: ticketNumber,
            draw: draw,
            drawTime: drawTime,
            bets: bets,
            total: total,
            agentName: agentName,
            date: new Date()
        });
        
        await ticket.save();
        
        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                number: ticket.number,
                date: ticket.date,
                draw: ticket.draw,
                drawTime: ticket.drawTime,
                bets: ticket.bets,
                total: ticket.total,
                agentName: ticket.agentName
            }
        });
    } catch (error) {
        console.error('Erreur sauvegarde ticket:', error);
        res.status(500).json({ success: false, error: 'Erreur sauvegarde' });
    }
});

app.get('/api/tickets', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ date: -1 }).limit(50);
        const total = await Ticket.countDocuments();
        
        res.json({
            success: true,
            tickets: tickets,
            nextTicketNumber: total > 0 ? tickets[0].number + 1 : 100001
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur chargement tickets' });
    }
});

// Route santé
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'online', 
        timestamp: new Date().toISOString(),
        database: db.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Routes HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/*.html', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    res.sendFile(filePath);
});

// Gestion erreurs
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: 'Route non trouvée'
        });
    }
    res.status(404).send('Page non trouvée');
});

// Démarrer serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`🌐 Accès: http://localhost:${PORT}/`);
});