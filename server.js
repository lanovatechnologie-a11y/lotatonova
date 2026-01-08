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

// Schéma des résultats de tirage
const drawResultSchema = new mongoose.Schema({
    drawId: { type: String, required: true }, // miami, georgia, etc.
    drawTime: { type: String, required: true }, // morning, evening
    date: { type: Date, required: true },
    firstLot: { type: String, required: true }, // 3 chiffres
    secondLot: { type: String, required: true }, // 2 chiffres
    thirdLot: { type: String, required: true }, // 2 chiffres
    publishedBy: { type: String, required: true }, // ID de l'utilisateur
    publishedAt: { type: Date, default: Date.now }
});

// Schéma des tickets
const ticketSchema = new mongoose.Schema({
    ticketNumber: { type: String, required: true },
    drawId: { type: String, required: true },
    drawTime: { type: String, required: true },
    date: { type: Date, required: true },
    bets: [{
        type: { type: String, required: true },
        name: { type: String, required: true },
        number: { type: String, required: true },
        amount: { type: Number, required: true },
        multiplier: { type: Number, required: true }
    }],
    total: { type: Number, required: true },
    agentName: { type: String, required: true },
    agentId: { type: String, required: true },
    isMultiDraw: { type: Boolean, default: false },
    multiDraws: [{ type: String }],
    status: { 
        type: String, 
        enum: ['pending', 'validated', 'cancelled'],
        default: 'pending'
    },
    winningAmount: { type: Number, default: 0 },
    checkedAt: { type: Date }
});

// Schéma des gagnants
const winnerSchema = new mongoose.Schema({
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
    drawId: { type: String, required: true },
    drawTime: { type: String, required: true },
    date: { type: Date, required: true },
    winningBets: [{
        type: { type: String, required: true },
        number: { type: String, required: true },
        amount: { type: Number, required: true },
        winningAmount: { type: Number, required: true }
    }],
    totalWinningAmount: { type: Number, required: true },
    claimed: { type: Boolean, default: false },
    claimedAt: { type: Date }
});

const User = mongoose.model('User', userSchema);
const DrawResult = mongoose.model('DrawResult', drawResultSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const Winner = mongoose.model('Winner', winnerSchema);

// === MIDDLEWARE D'AUTHENTIFICATION ===
async function requireAuth(req, res, next) {
    try {
        const token = req.cookies.nova_token;
        
        if (!token || !token.startsWith('nova_')) {
            return res.redirect('/');
        }
        
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

        const token = `nova_${Date.now()}_${user._id}`;

        res.cookie('nova_token', token, {
            httpOnly: true,
            secure: true,
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'none',
            path: '/'
        });

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

// === ROUTES RÉSULTATS ===

// Publier un résultat
app.post('/api/results', requireAuth, async (req, res) => {
    try {
        const { drawId, drawTime, firstLot, secondLot, thirdLot } = req.body;
        
        if (!drawId || !drawTime || !firstLot || !secondLot || !thirdLot) {
            return res.status(400).json({
                success: false,
                error: 'Tous les champs sont requis'
            });
        }

        const existingResult = await DrawResult.findOne({
            drawId,
            drawTime,
            date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });

        if (existingResult) {
            return res.status(400).json({
                success: false,
                error: 'Un résultat existe déjà pour ce tirage aujourd\'hui'
            });
        }

        const drawResult = new DrawResult({
            drawId,
            drawTime,
            date: new Date(),
            firstLot,
            secondLot,
            thirdLot,
            publishedBy: req.user._id
        });

        await drawResult.save();

        // Vérifier automatiquement les tickets gagnants
        await checkWinningTickets(drawId, drawTime, firstLot, secondLot, thirdLot);

        res.json({
            success: true,
            message: 'Résultat publié avec succès',
            result: drawResult
        });

    } catch (error) {
        console.error('Publish result error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Obtenir les derniers résultats
app.get('/api/results/latest', async (req, res) => {
    try {
        const results = await DrawResult.find()
            .sort({ date: -1 })
            .limit(10)
            .populate('publishedBy', 'name username');

        res.json({
            success: true,
            results
        });
    } catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Obtenir les résultats d'un tirage spécifique
app.get('/api/results/:drawId/:drawTime', async (req, res) => {
    try {
        const { drawId, drawTime } = req.params;
        
        const result = await DrawResult.findOne({
            drawId,
            drawTime,
            date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }).populate('publishedBy', 'name username');

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Aucun résultat trouvé pour ce tirage'
            });
        }

        res.json({
            success: true,
            result
        });
    } catch (error) {
        console.error('Get specific result error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// === ROUTES TICKETS ===

// Soumettre un ticket
app.post('/api/tickets', requireAuth, async (req, res) => {
    try {
        const { 
            ticketNumber, 
            drawId, 
            drawTime, 
            bets, 
            total,
            isMultiDraw,
            multiDraws 
        } = req.body;

        if (!ticketNumber || !drawId || !drawTime || !bets || !total) {
            return res.status(400).json({
                success: false,
                error: 'Tous les champs sont requis'
            });
        }

        const ticket = new Ticket({
            ticketNumber,
            drawId,
            drawTime,
            date: new Date(),
            bets,
            total,
            agentName: req.user.name,
            agentId: req.user._id,
            isMultiDraw: isMultiDraw || false,
            multiDraws: multiDraws || [],
            status: 'pending'
        });

        await ticket.save();

        res.json({
            success: true,
            message: 'Ticket enregistré avec succès',
            ticket
        });

    } catch (error) {
        console.error('Submit ticket error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Obtenir les tickets d'un agent
app.get('/api/tickets/agent/:agentId', requireAuth, async (req, res) => {
    try {
        const { agentId } = req.params;
        
        const tickets = await Ticket.find({ agentId })
            .sort({ date: -1 })
            .limit(50);

        res.json({
            success: true,
            tickets
        });
    } catch (error) {
        console.error('Get agent tickets error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Vérifier les tickets gagnants
async function checkWinningTickets(drawId, drawTime, firstLot, secondLot, thirdLot) {
    try {
        // Récupérer tous les tickets pour ce tirage
        const tickets = await Ticket.find({
            drawId,
            drawTime,
            date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            status: 'pending'
        });

        for (const ticket of tickets) {
            let totalWinningAmount = 0;
            const winningBets = [];

            for (const bet of ticket.bets) {
                let winningAmount = 0;
                let isWinning = false;

                // Logique de vérification (identique à celle du front-end)
                switch(bet.type) {
                    case 'borlette': // 1er lot
                        if (firstLot.slice(-2) === bet.number) {
                            isWinning = true;
                            winningAmount = bet.amount * 60;
                        }
                        break;
                        
                    case 'borlette2': // 2e lot
                        if (secondLot === bet.number) {
                            isWinning = true;
                            winningAmount = bet.amount * 20;
                        }
                        break;
                        
                    case 'borlette3': // 3e lot
                        if (thirdLot === bet.number) {
                            isWinning = true;
                            winningAmount = bet.amount * 10;
                        }
                        break;
                        
                    case 'lotto3': // Lotto 3 (1er lot)
                        if (firstLot === bet.number) {
                            isWinning = true;
                            winningAmount = bet.amount * 500;
                        }
                        break;
                        
                    case 'lotto4': // Lotto 4
                        const [num1, num2] = bet.number.split('*');
                        
                        if (firstLot.slice(-2) + secondLot === num1 + num2 ||
                            firstLot.slice(-2) + secondLot === num2 + num1 ||
                            firstLot.slice(-2) + thirdLot === num1 + num2 ||
                            firstLot.slice(-2) + thirdLot === num2 + num1 ||
                            secondLot + thirdLot === num1 + num2 ||
                            secondLot + thirdLot === num2 + num1) {
                            isWinning = true;
                            winningAmount = bet.amount * 5000;
                        }
                        break;
                        
                    case 'lotto5': // Lotto 5
                        const [num5_1, num5_2] = bet.number.split('*');
                        
                        if (firstLot + secondLot === num5_1 + num5_2 ||
                            firstLot + thirdLot === num5_1 + num5_2) {
                            isWinning = true;
                            winningAmount = bet.amount * 25000;
                        }
                        break;
                        
                    case 'marriage': // Mariage
                        const [m1, m2] = bet.number.split('*');
                        const allNumbers = firstLot + secondLot + thirdLot;
                        
                        if (allNumbers.includes(m1) && allNumbers.includes(m2)) {
                            isWinning = true;
                            winningAmount = bet.amount * 1000;
                        }
                        break;
                }

                if (isWinning) {
                    winningBets.push({
                        type: bet.type,
                        number: bet.number,
                        amount: bet.amount,
                        winningAmount
                    });
                    totalWinningAmount += winningAmount;
                }
            }

            if (winningBets.length > 0) {
                // Mettre à jour le ticket
                ticket.winningAmount = totalWinningAmount;
                ticket.status = 'validated';
                ticket.checkedAt = new Date();
                await ticket.save();

                // Créer une entrée de gagnant
                const winner = new Winner({
                    ticketId: ticket._id,
                    drawId,
                    drawTime,
                    date: new Date(),
                    winningBets,
                    totalWinningAmount
                });

                await winner.save();
            } else {
                // Marquer comme non gagnant
                ticket.status = 'validated';
                ticket.checkedAt = new Date();
                await ticket.save();
            }
        }

        console.log(`Vérification terminée pour ${tickets.length} tickets`);
    } catch (error) {
        console.error('Check winning tickets error:', error);
    }
}

// === ROUTES GAGNANTS ===

// Obtenir les gagnants d'un tirage
app.get('/api/winners/:drawId/:drawTime', async (req, res) => {
    try {
        const { drawId, drawTime } = req.params;
        
        const winners = await Winner.find({ drawId, drawTime })
            .populate('ticketId')
            .sort({ totalWinningAmount: -1 });

        res.json({
            success: true,
            winners
        });
    } catch (error) {
        console.error('Get winners error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Obtenir les gagnants d'un agent
app.get('/api/winners/agent/:agentId', requireAuth, async (req, res) => {
    try {
        const { agentId } = req.params;
        
        const winners = await Winner.find()
            .populate({
                path: 'ticketId',
                match: { agentId }
            })
            .then(winners => winners.filter(winner => winner.ticketId));

        res.json({
            success: true,
            winners
        });
    } catch (error) {
        console.error('Get agent winners error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// Marquer un gain comme réclamé
app.post('/api/winners/:winnerId/claim', requireAuth, async (req, res) => {
    try {
        const { winnerId } = req.params;
        
        const winner = await Winner.findById(winnerId).populate('ticketId');
        
        if (!winner) {
            return res.status(404).json({
                success: false,
                error: 'Gagnant non trouvé'
            });
        }

        // Vérifier que l'utilisateur a le droit de réclamer
        if (winner.ticketId.agentId.toString() !== req.user._id.toString() && 
            req.user.role !== 'subsystem' && 
            req.user.role !== 'master') {
            return res.status(403).json({
                success: false,
                error: 'Non autorisé'
            });
        }

        winner.claimed = true;
        winner.claimedAt = new Date();
        await winner.save();

        res.json({
            success: true,
            message: 'Gain marqué comme réclamé',
            winner
        });
    } catch (error) {
        console.error('Claim winner error:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
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