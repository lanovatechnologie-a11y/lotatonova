const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
app.use(compression()); // Pour la performance (inclus dans votre package.json)
app.use(cors()); // Pour autoriser le frontend à se connecter
app.use(express.json()); // Pour lire le JSON (remplace body-parser)

// --- CONNEXION MONGODB ---
// Attention : on utilise les crochets car votre variable contient un tiret (-)
const dbUrl = process.env['MONGODB-URL'];

if (!dbUrl) {
    console.error("ERREUR CRITIQUE : La variable d'environnement 'MONGODB-URL' n'est pas définie !");
} else {
    mongoose.connect(dbUrl)
    .then(() => console.log('✅ Connecté à MongoDB (Production)'))
    .catch(err => console.error('❌ Erreur connexion MongoDB:', err));
}

// --- MODÈLES (SCHEMAS) ---

// Modèle Utilisateur (Sans hachage de mot de passe)
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Stocké en texte clair comme demandé
    role: { type: String, default: 'agent' },
    balance: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// Modèle Ticket
const TicketSchema = new mongoose.Schema({
    userId: { type: String }, // On stocke l'ID en string simple pour éviter les erreurs de ref
    agentName: { type: String },
    ticketNumber: { type: String, required: true },
    draw: { type: String }, // Miami, New York...
    drawTime: { type: String }, // Morning, Evening
    bets: [
        {
            type: String, // borlette, lotto3...
            number: String,
            amount: Number,
            name: String
        }
    ],
    total: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});
const Ticket = mongoose.model('Ticket', TicketSchema);

// --- MIDDLEWARE SIMPLIFIÉ (Sans jsonwebtoken) ---
// Puisque nous n'avons pas jsonwebtoken dans package.json, on fait une vérification basique
const simpleAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // On vérifie juste si un header existe pour ne pas bloquer le front, 
    // mais on ne peut pas vérifier la signature cryptographique sans la librairie.
    if (!authHeader) {
        return res.status(401).json({ message: "Non autorisé (Token manquant)" });
    }
    next();
};

// --- ROUTES ---

// 1. Vérification de santé (Health Check)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Nova Lotto Backend is running' });
});

// 2. Login (Comparaison directe sans hachage)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Recherche de l'utilisateur
        const user = await User.findOne({ username });

        // Vérification directe du mot de passe (Texte clair)
        if (!user || user.password !== password) {
            return res.status(400).json({ message: "Identifiant ou mot de passe incorrect" });
        }

        // On génère un "faux" token simple car on n'a pas la librairie JWT
        // Le frontend a juste besoin d'une string non-vide dans "token"
        const fakeToken = `session-${user._id}-${Date.now()}`;

        res.json({
            token: fakeToken,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                balance: user.balance
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur", error: error.message });
    }
});

// 3. Création compte (Pour créer votre admin facilement)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "Utilisateur déjà existant" });
        }

        const newUser = new User({
            username,
            password, // Enregistré tel quel (pas sécurisé, mais c'est votre choix)
            role: role || 'agent'
        });

        await newUser.save();
        res.status(201).json({ message: "Utilisateur créé avec succès" });
    } catch (error) {
        res.status(500).json({ message: "Erreur création", error: error.message });
    }
});

// 4. Sauvegarder un ticket
app.post('/api/tickets', simpleAuth, async (req, res) => {
    try {
        const ticketData = req.body;
        
        // On s'assure que la date est bien gérée
        if (!ticketData.date) ticketData.date = new Date();

        const newTicket = new Ticket(ticketData);
        await newTicket.save();

        res.status(201).json({ success: true, ticket: newTicket });
    } catch (error) {
        console.error("Erreur sauvegarde ticket:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. Récupérer l'historique des tickets
app.get('/api/tickets', simpleAuth, async (req, res) => {
    try {
        // Récupère les 100 derniers tickets triés par date
        const tickets = await Ticket.find().sort({ date: -1 }).limit(100);
        res.json({ tickets: tickets });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 6. Résultats (Mock - Données fictives pour l'instant)
app.get('/api/results', (req, res) => {
    // Si vous avez une collection "Result", remplacez ceci par Result.find()...
    res.json({
        results: {
            miami: { morning: { lot1: '123', lot2: '45', lot3: '67', date: new Date() } },
            newyork: { morning: { lot1: '888', lot2: '11', lot3: '22', date: new Date() } }
        }
    });
});

// 7. Info entreprise et logo
app.get('/api/company-info', (req, res) => {
    res.json({
        name: "Nova Lotto",
        phone: "+509 00 00 00 00",
        address: "Haiti",
    });
});

app.get('/api/logo', (req, res) => {
    // Vous pouvez renvoyer une URL d'image hébergée ou null
    res.json({ logoUrl: null });
});

// --- DÉMARRAGE ---
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
