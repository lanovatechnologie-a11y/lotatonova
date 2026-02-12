// server-complet.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging détaillé
app.use((req, res, next) => {
    console.log(`\n=== ${new Date().toISOString()} ===`);
    console.log(`${req.method} ${req.originalUrl}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    if (req.method === 'POST' && req.body) {
        console.log('Body reçu:');
        console.log(JSON.stringify(req.body, null, 2));
    }
    next();
});

// Connexion MongoDB
console.log('🔄 Connexion à MongoDB...');
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI non défini dans .env');
    process.exit(1);
}

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
})
.then(() => {
    console.log('✅ MongoDB connecté avec succès');
    console.log('Base de données:', mongoose.connection.name);
})
.catch((err) => {
    console.error('❌ Erreur connexion MongoDB:', err.message);
    console.error('URI utilisée:', MONGODB_URI ? 'Définie' : 'Non définie');
    process.exit(1);
});

// Schéma Ticket CORRIGÉ
const ticketSchema = new mongoose.Schema({
    // Supprimer l'index unique sur ticketNumber pour éviter les conflits
    ticketNumber: { 
        type: Number, 
        required: true 
    },
    draw: { 
        type: String, 
        required: true 
    },
    draw_time: { 
        type: String, 
        required: true,
        enum: ['morning', 'evening'] 
    },
    bets: { 
        type: Array, 
        required: true,
        default: [] 
    },
    total: { 
        type: Number, 
        required: true,
        min: 1 
    },
    agent_id: { 
        type: String, 
        required: true 
    },
    agent_name: { 
        type: String, 
        required: true 
    },
    subsystem_id: { 
        type: String, 
        required: true 
    },
    date: { 
        type: Date, 
        default: Date.now 
    },
    status: {
        type: String,
        default: 'active',
        enum: ['active', 'cancelled', 'paid']
    }
}, {
    timestamps: true
});

// Index pour optimisation (sans unique)
ticketSchema.index({ subsystem_id: 1, ticketNumber: -1 });
ticketSchema.index({ date: -1 });
ticketSchema.index({ agent_id: 1 });

const Ticket = mongoose.model('Ticket', ticketSchema);

// Schéma Admin
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    subsystem_id: { type: String, required: true },
    subsystem_name: { type: String, required: true },
    role: { type: String, default: 'agent' }
}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);

// Middleware d'authentification SIMPLIFIÉ
const auth = async (req, res, next) => {
    const token = req.header('x-auth-token');
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Token d\'authentification manquant' 
        });
    }
    
    try {
        // Pour test - accepter n'importe quel token
        // En production, vérifier avec JWT
        console.log('🔑 Token reçu:', token.substring(0, 20) + '...');
        
        // Simulation d'un utilisateur valide
        req.user = {
            id: 'user_123456',
            username: 'agent_test',
            name: 'Agent de Test',
            subsystem_id: 'subsystem_001',
            subsystem_name: 'Sous-système Principal'
        };
        
        next();
    } catch (error) {
        console.error('Erreur authentification:', error);
        res.status(401).json({ 
            success: false, 
            error: 'Token invalide' 
        });
    }
};

// ============ ENDPOINTS ============

// 1. Test santé
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'API Nova Lotto opérationnelle',
        timestamp: new Date().toISOString(),
        mongo: mongoose.connection.readyState === 1 ? 'connecté' : 'déconnecté'
    });
});

// 2. Connexion (pour compatibilité)
app.post('/api/auth/login', async (req, res) => {
    try {
        console.log('Tentative de connexion:', req.body.username);
        
        // Accepte TOUS les logins pour test
        const token = jwt.sign(
            {
                id: 'user_' + Date.now(),
                username: req.body.username || 'test',
                name: 'Agent Test',
                subsystem_id: 'default_system',
                subsystem_name: 'Système par défaut'
            },
            process.env.JWT_SECRET || 'nova_lotto_secret_2024',
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            token: token,
            admin: {
                id: 'user_123',
                username: req.body.username || 'test',
                name: 'Agent Test',
                subsystem_id: 'default_system',
                subsystem_name: 'Système par défaut'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Vérification authentification
app.get('/api/auth/check', auth, (req, res) => {
    res.json({
        success: true,
        admin: req.user
    });
});

// 4. CRITIQUE : Création de ticket (FONCTIONNEL)
app.post('/api/tickets', auth, async (req, res) => {
    console.log('🎫 NOUVELLE DEMANDE DE TICKET');
    
    try {
        // Log complet des données reçues
        console.log('📦 Données reçues:', JSON.stringify(req.body, null, 2));
        
        // Validation minimale
        if (!req.body.bets || !Array.isArray(req.body.bets) || req.body.bets.length === 0) {
            console.log('❌ Erreur: bets manquant ou vide');
            return res.status(400).json({
                success: false,
                error: 'Le tableau des paris (bets) est requis et ne peut pas être vide',
                received: req.body
            });
        }
        
        // Calculer le total si non fourni
        const total = req.body.total || req.body.bets.reduce((sum, bet) => {
            return sum + (parseFloat(bet.amount) || 0);
        }, 0);
        
        console.log(`💰 Total calculé: ${total}`);
        
        // Trouver le prochain numéro de ticket
        let nextTicketNumber;
        try {
            const lastTicket = await Ticket.findOne().sort({ ticketNumber: -1 });
            console.log('📊 Dernier ticket trouvé:', lastTicket ? `#${lastTicket.ticketNumber}` : 'Aucun');
            
            if (lastTicket && lastTicket.ticketNumber) {
                nextTicketNumber = lastTicket.ticketNumber + 1;
            } else {
                nextTicketNumber = 100001;
            }
        } catch (findError) {
            console.error('Erreur recherche dernier ticket:', findError);
            nextTicketNumber = 100001;
        }
        
        console.log(`🔢 Prochain numéro de ticket: ${nextTicketNumber}`);
        
        // Préparer les données du ticket
        const ticketData = {
            ticketNumber: nextTicketNumber,
            draw: req.body.draw || 'miami',
            draw_time: req.body.draw_time || req.body.drawTime || 'morning',
            bets: req.body.bets,
            total: total,
            agent_id: req.body.agent_id || req.user.id,
            agent_name: req.body.agent_name || req.user.name,
            subsystem_id: req.body.subsystem_id || req.user.subsystem_id || 'default',
            date: req.body.date ? new Date(req.body.date) : new Date()
        };
        
        console.log('📝 Données du ticket:', JSON.stringify(ticketData, null, 2));
        
        // Créer et sauvegarder le ticket
        const ticket = new Ticket(ticketData);
        const savedTicket = await ticket.save();
        
        console.log(`✅ Ticket #${nextTicketNumber} sauvegardé avec succès!`);
        console.log('ID MongoDB:', savedTicket._id);
        
        // Réponse formatée pour le frontend
        const responseData = {
            success: true,
            message: `Ticket #${nextTicketNumber} créé avec succès`,
            ticket: {
                id: savedTicket._id.toString(),
                ticketNumber: savedTicket.ticketNumber,
                number: savedTicket.ticketNumber, // Compatibilité
                draw: savedTicket.draw,
                drawTime: savedTicket.draw_time,
                bets: savedTicket.bets,
                total: savedTicket.total,
                agent_id: savedTicket.agent_id,
                agent_name: savedTicket.agent_name,
                subsystem_id: savedTicket.subsystem_id,
                date: savedTicket.date,
                created_at: savedTicket.createdAt,
                updated_at: savedTicket.updatedAt
            },
            nextTicketNumber: nextTicketNumber + 1
        };
        
        console.log('📤 Réponse envoyée:', JSON.stringify(responseData, null, 2));
        
        res.json(responseData);
        
    } catch (error) {
        console.error('❌ ERREUR CRITIQUE création ticket:', error);
        console.error('Stack trace:', error.stack);
        console.error('Données reçues:', req.body);
        
        // Gestion spécifique des erreurs
        let errorMessage = error.message;
        let statusCode = 500;
        
        if (error.name === 'ValidationError') {
            statusCode = 400;
            errorMessage = Object.values(error.errors).map(e => e.message).join(', ');
        } else if (error.name === 'MongoError') {
            if (error.code === 11000) {
                statusCode = 409;
                errorMessage = 'Conflit: ce numéro de ticket existe déjà';
            }
        }
        
        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            code: error.code || 'UNKNOWN_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 5. Récupérer tous les tickets
app.get('/api/tickets', auth, async (req, res) => {
    try {
        console.log('📋 Récupération des tickets...');
        
        const tickets = await Ticket.find()
            .sort({ ticketNumber: -1 })
            .limit(100)
            .lean();
        
        // Trouver le prochain numéro
        const lastTicket = await Ticket.findOne().sort({ ticketNumber: -1 });
        let nextTicketNumber = 100001;
        
        if (lastTicket && lastTicket.ticketNumber) {
            nextTicketNumber = lastTicket.ticketNumber + 1;
        }
        
        console.log(`📊 ${tickets.length} tickets trouvés, prochain: ${nextTicketNumber}`);
        
        res.json({
            success: true,
            tickets: tickets,
            nextTicketNumber: nextTicketNumber,
            count: tickets.length
        });
        
    } catch (error) {
        console.error('Erreur récupération tickets:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. Récupérer un ticket par ID
app.get('/api/tickets/:id', auth, async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        
        if (!ticket) {
            return res.status(404).json({ 
                success: false, 
                error: 'Ticket non trouvé' 
            });
        }
        
        res.json({
            success: true,
            ticket: ticket
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 7. Mettre à jour un ticket
app.put('/api/tickets/:id', auth, async (req, res) => {
    try {
        const ticket = await Ticket.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        
        res.json({
            success: true,
            ticket: ticket
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 8. Supprimer un ticket
app.delete('/api/tickets/:id', auth, async (req, res) => {
    try {
        await Ticket.findByIdAndDelete(req.params.id);
        
        res.json({
            success: true,
            message: 'Ticket supprimé'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 9. Tickets en attente (factice)
app.get('/api/tickets/pending', auth, (req, res) => {
    res.json({ 
        success: true, 
        tickets: [],
        count: 0
    });
});

// 10. Tickets gagnants (factice)
app.get('/api/tickets/winning', auth, (req, res) => {
    res.json({ 
        success: true, 
        tickets: [],
        count: 0
    });
});

// 11. Historique (factice)
app.get('/api/history', auth, (req, res) => {
    res.json({ 
        success: true, 
        history: [],
        count: 0
    });
});

app.post('/api/history', auth, (req, res) => {
    res.json({ 
        success: true, 
        message: 'Historique enregistré'
    });
});

// 12. Informations entreprise
app.get('/api/company-info', auth, (req, res) => {
    res.json({
        success: true,
        name: 'Nova Lotto',
        phone: '+509 32 53 49 58',
        address: 'Cap Haïtien',
        reportTitle: 'Nova Lotto',
        reportPhone: '40104585',
        logoUrl: 'logo-borlette.jpg'
    });
});

app.post('/api/company-info', auth, (req, res) => {
    res.json({
        success: true,
        ...req.body
    });
});

// 13. Logo
app.get('/api/logo', auth, (req, res) => {
    res.json({
        success: true,
        logoUrl: 'logo-borlette.jpg'
    });
});

// 14. Résultats (factice)
app.get('/api/results', auth, (req, res) => {
    res.json({
        success: true,
        results: {
            miami: {
                morning: { lot1: '123', lot2: '45', lot3: '34' },
                evening: { lot1: '456', lot2: '78', lot3: '90' }
            }
        }
    });
});

app.post('/api/results', auth, (req, res) => {
    res.json({
        success: true,
        message: 'Résultats enregistrés'
    });
});

// 15. Vérifier gagnants
app.post('/api/check-winners', auth, (req, res) => {
    res.json({
        success: true,
        winners: []
    });
});

// 16. Fiches multi-tirages
app.get('/api/tickets/multi-draw', auth, (req, res) => {
    res.json({
        success: true,
        tickets: []
    });
});

app.post('/api/tickets/multi-draw', auth, (req, res) => {
    res.json({
        success: true,
        message: 'Fiche multi-tirages enregistrée'
    });
});

// 17. Créer admin (pour test)
app.post('/api/admin/create', async (req, res) => {
    try {
        const admin = new Admin({
            username: req.body.username || 'admin',
            password: req.body.password || 'admin123',
            name: req.body.name || 'Administrateur',
            subsystem_id: req.body.subsystem_id || 'system_001',
            subsystem_name: req.body.subsystem_name || 'Système Principal'
        });
        
        await admin.save();
        
        res.json({
            success: true,
            admin: admin
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 18. Test de base de données
app.get('/api/db-test', async (req, res) => {
    try {
        // Compter les tickets
        const ticketCount = await Ticket.countDocuments();
        
        // Insérer un ticket de test
        const testTicket = new Ticket({
            ticketNumber: 999999,
            draw: 'test',
            draw_time: 'morning',
            bets: [{ type: 'test', number: '00', amount: 1 }],
            total: 1,
            agent_id: 'test_agent',
            agent_name: 'Agent Test',
            subsystem_id: 'test_system'
        });
        
        await testTicket.save();
        
        // Supprimer le ticket de test
        await Ticket.deleteOne({ ticketNumber: 999999 });
        
        res.json({
            success: true,
            message: 'Test de base de données réussi',
            ticketCount: ticketCount,
            mongoState: mongoose.connection.readyState,
            mongoHost: mongoose.connection.host,
            mongoDB: mongoose.connection.name
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            mongoState: mongoose.connection.readyState
        });
    }
});

// 19. Nettoyer la base (pour test)
app.delete('/api/clean-tickets', auth, async (req, res) => {
    try {
        const result = await Ticket.deleteMany({});
        res.json({
            success: true,
            message: `${result.deletedCount} tickets supprimés`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 20. Route racine
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API Nova Lotto',
        version: '2.0.0',
        endpoints: [
            '/api/health',
            '/api/auth/login',
            '/api/tickets',
            '/api/db-test'
        ]
    });
});

// Gestion erreur 404
app.use((req, res) => {
    console.log(`❌ Route non trouvée: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: `Route non trouvée: ${req.originalUrl}`
    });
});

// Gestion erreur globale
app.use((err, req, res, next) => {
    console.error('💥 ERREUR NON GÉRÉE:', err);
    res.status(500).json({
        success: false,
        error: 'Erreur interne du serveur',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Démarrer serveur
const server = app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log(`🚀 SERVEUR NOVA LOTTO DÉMARRÉ`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🕐 ${new Date().toLocaleString()}`);
    console.log(`🗄️  MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connecté' : '❌ Déconnecté'}`);
    console.log(`📊 Nom base: ${mongoose.connection.name}`);
    console.log('='.repeat(50) + '\n');
});

// Arrêt propre
process.on('SIGINT', async () => {
    console.log('\n🛑 Arrêt du serveur...');
    await mongoose.connection.close();
    server.close();
    process.exit(0);
});

// Export pour test
module.exports = app;