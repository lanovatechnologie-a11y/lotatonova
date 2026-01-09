
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');

const app = express();

// === MIDDLEWARE GZIP COMPRESSION ===
app.use(compression({
    level: 6, // Niveau de compression optimal (1-9)
    threshold: 1024, // Compresser seulement les fichiers > 1KB
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
    maxAge: '1d', // Cache pour 1 jour
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Connexion MongoDB (avec URL de prod ou localhost)
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
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['agent', 'supervisor', 'subsystem', 'master'],
    required: true
  },
  level: { type: Number, default: 1 }
});

const User = mongoose.model('User', userSchema);

// === NOUVEAU: Schémas pour les données LOTATO ===

// Schéma pour les tirages
const drawSchema = new mongoose.Schema({
  drawId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  times: {
    morning: { type: String, required: true },
    evening: { type: String, required: true }
  },
  enabled: { type: Boolean, default: true }
});

const Draw = mongoose.model('Draw', drawSchema);

// Schéma pour les types de paris
const betTypeSchema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  multiplier: { type: Number, required: true },
  multiplier2: { type: Number },
  multiplier3: { type: Number },
  icon: { type: String },
  description: { type: String },
  category: { type: String, enum: ['borlette', 'lotto', 'special'], default: 'special' }
});

const BetType = mongoose.model('BetType', betTypeSchema);

// Schéma pour les résultats
const resultSchema = new mongoose.Schema({
  drawId: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, enum: ['morning', 'evening'], required: true },
  lot1: { type: String, required: true },
  lot2: { type: String },
  lot3: { type: String }
});

const Result = mongoose.model('Result', resultSchema);

// Schéma pour les fiches (tickets)
const ticketSchema = new mongoose.Schema({
  ticketNumber: { type: String, required: true, unique: true },
  drawId: { type: String, required: true },
  drawTime: { type: String, required: true },
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agentName: { type: String, required: true },
  bets: [{
    type: { type: String, required: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    options: {
      option1: { type: Boolean },
      option2: { type: Boolean },
      option3: { type: Boolean }
    },
    perOptionAmount: { type: Number },
    isAuto: { type: Boolean, default: false },
    isGroup: { type: Boolean, default: false },
    details: [{
      number: String,
      amount: Number
    }]
  }],
  totalAmount: { type: Number, required: true },
  isMultiDraw: { type: Boolean, default: false },
  multiDraws: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  synced: { type: Boolean, default: false }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

// Schéma pour les fiches multi-tirages
const multiDrawTicketSchema = new mongoose.Schema({
  ticketNumber: { type: String, required: true, unique: true },
  draws: [{ type: String, required: true }],
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agentName: { type: String, required: true },
  bets: [{
    gameType: { type: String, required: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    draws: [{ type: String }]
  }],
  totalAmount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

const MultiDrawTicket = mongoose.model('MultiDrawTicket', multiDrawTicketSchema);

// Schéma pour les informations de l'entreprise
const companyInfoSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  reportTitle: { type: String, required: true },
  reportPhone: { type: String, required: true },
  logo: { type: String }
});

const CompanyInfo = mongoose.model('CompanyInfo', companyInfoSchema);

// === ROUTE DE CONNEXION ===
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const user = await User.findOne({ 
      username,
      password,
      role,
      deleted: { $exists: false } // Si champ "deleted" existe dans les modèles
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants ou rôle incorrect'
      });
    }

    // Générer un token simplifié temporaire
    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;

    // Déterminer la redirection en fonction du rôle et niveau
    let redirectUrl;
    switch (user.role) {
      case 'agent':
        redirectUrl = '/lotato.html';
        break;
      case 'supervisor':
        if (user.level === 1) {
          redirectUrl = '/control-level1.html';
        } else if (user.level === 2) {
          redirectUrl = '/control-level2.html';
        } else {
          redirectUrl = '/supervisor-control.html';
        }
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
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la connexion'
    });
  }
});

// === MIDDLWARE DE VÉRIFICATION DE TOKEN ===
function vérifierToken(req, res, next) {
  const { token } = req.query;
  if (!token || !token.startsWith('nova_')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Token manquant ou invalide' 
    });
  }
  // Ne vérifie pas le token en détail pour garder le système léger
  next();
}

// === NOUVEAUX ENDPOINTS POUR LOTATO ===

// 1. Endpoint de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// 2. Endpoint pour les tirages
app.get('/api/draws', async (req, res) => {
  try {
    const draws = await Draw.find({ enabled: true });
    res.json({ 
      success: true, 
      draws: draws.map(draw => ({
        drawId: draw.drawId,
        name: draw.name,
        times: draw.times,
        enabled: draw.enabled
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du chargement des tirages' 
    });
  }
});

// 3. Endpoint pour les types de paris
app.get('/api/bet-types', async (req, res) => {
  try {
    const betTypes = await BetType.find({});
    res.json({ 
      success: true, 
      betTypes: betTypes.map(betType => ({
        gameId: betType.gameId,
        name: betType.name,
        multiplier: betType.multiplier,
        multiplier2: betType.multiplier2,
        multiplier3: betType.multiplier3,
        icon: betType.icon,
        description: betType.description,
        category: betType.category
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du chargement des types de paris' 
    });
  }
});

// 4. Endpoint pour les résultats
app.get('/api/results', async (req, res) => {
  try {
    const { drawId, date, time } = req.query;
    let query = {};
    
    if (drawId) query.drawId = drawId;
    if (date) query.date = new Date(date);
    if (time) query.time = time;
    
    const results = await Result.find(query).sort({ date: -1 }).limit(50);
    
    res.json({ 
      success: true, 
      results: results.map(result => ({
        drawId: result.drawId,
        date: result.date,
        time: result.time,
        lot1: result.lot1,
        lot2: result.lot2,
        lot3: result.lot3
      }))
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du chargement des résultats' 
    });
  }
});

// 5. Endpoint pour les derniers résultats
app.get('/api/results/latest', async (req, res) => {
  try {
    const latestResults = await Result.aggregate([
      {
        $sort: { date: -1 }
      },
      {
        $group: {
          _id: { drawId: "$drawId", time: "$time" },
          date: { $first: "$date" },
          lot1: { $first: "$lot1" },
          lot2: { $first: "$lot2" },
          lot3: { $first: "$lot3" }
        }
      }
    ]);
    
    // Organiser les résultats par tirage
    const organizedResults = {};
    latestResults.forEach(result => {
      const drawId = result._id.drawId;
      if (!organizedResults[drawId]) {
        organizedResults[drawId] = {};
      }
      
      if (result._id.time === 'morning') {
        organizedResults[drawId].morning = {
          date: result.date,
          lot1: result.lot1,
          lot2: result.lot2,
          lot3: result.lot3
        };
      } else if (result._id.time === 'evening') {
        organizedResults[drawId].evening = {
          date: result.date,
          lot1: result.lot1,
          lot2: result.lot2,
          lot3: result.lot3
        };
      }
    });
    
    res.json({ 
      success: true, 
      results: organizedResults
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors du chargement des derniers résultats' 
    });
  }
});

// 6. Endpoint pour créer une fiche
app.post('/api/tickets', vérifierToken, async (req, res) => {
  try {
    const { drawId, drawTime, bets, totalAmount, isMultiDraw, multiDraws } = req.body;
    
    // Générer un numéro de fiche unique
    const today = new Date();
    const dateString = today.toISOString().split('T')[0].replace(/-/g, '');
    const count = await Ticket.countDocuments({ createdAt: { $gte: today.setHours(0,0,0,0) } });
    const ticketNumber = `T${dateString}${String(count + 1).padStart(4, '0')}`;
    
    // Récupérer l'agent depuis le token (simplifié)
    const token = req.query.token;
    const tokenParts = token.split('_');
    const agentId = tokenParts[2];
    const user = await User.findById(agentId);
    
    const ticket = new Ticket({
      ticketNumber,
      drawId,
      drawTime,
      agentId: user._id,
      agentName: user.username,
      bets,
      totalAmount,
      isMultiDraw: isMultiDraw || false,
      multiDraws: multiDraws || [],
      createdAt: new Date(),
      synced: true
    });
    
    await ticket.save();
    
    res.json({
      success: true,
      message: 'Fiche créée avec succès',
      ticket: {
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        drawId: ticket.drawId,
        drawTime: ticket.drawTime,
        totalAmount: ticket.totalAmount,
        createdAt: ticket.createdAt
      }
    });
  } catch (error) {
    console.error('Erreur création fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de la fiche'
    });
  }
});

// 7. Endpoint pour les fiches d'un agent
app.get('/api/tickets/my-tickets', vérifierToken, async (req, res) => {
  try {
    const token = req.query.token;
    const tokenParts = token.split('_');
    const agentId = tokenParts[2];
    
    const tickets = await Ticket.find({ agentId }).sort({ createdAt: -1 }).limit(50);
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        drawId: ticket.drawId,
        drawTime: ticket.drawTime,
        totalAmount: ticket.totalAmount,
        createdAt: ticket.createdAt,
        synced: ticket.synced
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des fiches'
    });
  }
});

// 8. Endpoint pour vérifier les fiches gagnantes
app.post('/api/tickets/check-winners', vérifierToken, async (req, res) => {
  try {
    const { drawId, drawTime, date } = req.body;
    
    // Récupérer le résultat du tirage
    const resultDate = new Date(date);
    const result = await Result.findOne({
      drawId,
      time: drawTime,
      date: {
        $gte: resultDate.setHours(0,0,0,0),
        $lt: resultDate.setHours(23,59,59,999)
      }
    });
    
    if (!result) {
      return res.json({
        success: false,
        error: 'Aucun résultat trouvé pour ce tirage'
      });
    }
    
    // Récupérer les fiches pour ce tirage
    const tickets = await Ticket.find({
      drawId,
      drawTime,
      createdAt: {
        $gte: resultDate.setHours(0,0,0,0),
        $lt: resultDate.setHours(23,59,59,999)
      }
    });
    
    // Simuler la vérification des gagnants
    // Dans une vraie implémentation, vous auriez une logique complexe
    const winningTickets = tickets.map(ticket => {
      const winningBets = [];
      let totalWinnings = 0;
      
      // Logique simplifiée de vérification
      ticket.bets.forEach(bet => {
        if (bet.type === 'borlette' || bet.type === 'boulpe') {
          if (bet.number === result.lot1) {
            const winAmount = bet.amount * bet.multiplier;
            winningBets.push({
              name: bet.name,
              number: bet.number,
              winAmount,
              winType: '1er lot',
              matchedNumber: result.lot1
            });
            totalWinnings += winAmount;
          }
        }
        // Ajouter d'autres logiques de vérification pour les autres types de paris
      });
      
      if (winningBets.length > 0) {
        return {
          ticketNumber: ticket.ticketNumber,
          drawId: ticket.drawId,
          drawTime: ticket.drawTime,
          date: ticket.createdAt,
          winningBets,
          totalWinnings
        };
      }
      return null;
    }).filter(ticket => ticket !== null);
    
    res.json({
      success: true,
      result: {
        drawId: result.drawId,
        date: result.date,
        time: result.time,
        lot1: result.lot1,
        lot2: result.lot2,
        lot3: result.lot3
      },
      winningTickets,
      totalWinningTickets: winningTickets.length,
      totalWinnings: winningTickets.reduce((sum, ticket) => sum + ticket.totalWinnings, 0)
    });
  } catch (error) {
    console.error('Erreur vérification gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification des gagnants'
    });
  }
});

// 9. Endpoint pour les informations de l'entreprise
app.get('/api/company-info', async (req, res) => {
  try {
    let companyInfo = await CompanyInfo.findOne({});
    
    if (!companyInfo) {
      // Créer des informations par défaut
      companyInfo = new CompanyInfo({
        name: "Nova Lotto",
        phone: "+509 32 53 49 58",
        address: "Cap Haïtien",
        reportTitle: "Nova Lotto",
        reportPhone: "40104585"
      });
      await companyInfo.save();
    }
    
    res.json({
      success: true,
      companyInfo: {
        name: companyInfo.name,
        phone: companyInfo.phone,
        address: companyInfo.address,
        reportTitle: companyInfo.reportTitle,
        reportPhone: companyInfo.reportPhone,
        logo: companyInfo.logo
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des informations de l\'entreprise'
    });
  }
});

// === ROUTES API AVEC COMPRESSION ===

// Route pour les statistiques du système
app.get('/api/system/stats', vérifierToken, async (req, res) => {
    try {
        const stats = {
            activeAgents: await User.countDocuments({ role: 'agent', deleted: { $exists: false } }),
            openTickets: 0, // À adapter selon votre modèle
            todaySales: 0, // À adapter selon votre modèle
            pendingTasks: 0 // À adapter selon votre modèle
        };
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des stats' });
    }
});

// Route pour les activités récentes
app.get('/api/activities/recent', vérifierToken, async (req, res) => {
    try {
        const activities = []; // À adapter selon votre modèle
        res.json({ success: true, activities });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des activités' });
    }
});

// Route pour les agents
app.get('/api/agents', vérifierToken, async (req, res) => {
    try {
        const agents = await User.find({ role: 'agent', deleted: { $exists: false } });
        res.json({ success: true, agents });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des agents' });
    }
});

// Route pour créer un agent
app.post('/api/agents/create', vérifierToken, async (req, res) => {
    try {
        const { name, email, level, password } = req.body;
        const newAgent = new User({
            username: email,
            password: password,
            role: 'agent',
            level: parseInt(level)
        });
        await newAgent.save();
        res.json({ success: true, message: 'Agent créé avec succès' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors de la création de l\'agent' });
    }
});

// Route pour les tickets
app.get('/api/tickets', vérifierToken, async (req, res) => {
    try {
        const tickets = []; // À adapter selon votre modèle
        res.json({ success: true, tickets });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des tickets' });
    }
});

// Route pour les rapports
app.get('/api/reports/generate', vérifierToken, async (req, res) => {
    try {
        const { period } = req.query;
        const report = {
            period: period,
            monthlyPerformance: 85,
            ticketResolution: 92,
            activeAgents: await User.countDocuments({ role: 'agent', deleted: { $exists: false } }),
            pendingTickets: 5
        };
        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors de la génération du rapport' });
    }
});

// Route pour les paramètres
app.post('/api/system/settings', vérifierToken, async (req, res) => {
    try {
        // Logique de sauvegarde des paramètres
        res.json({ success: true, message: 'Paramètres sauvegardés avec succès' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors de la sauvegarde des paramètres' });
    }
});

// === ROUTES HTML AVEC COMPRESSION ===
const fs = require('fs');

// 1. Page principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Sous-système (subsystem-admin.html)
app.get('/subsystem-admin.html', vérifierToken, (req, res) => {
  const filePath = path.join(__dirname, 'subsystem-admin.html');
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: "Fichier /subsystem-admin.html introuvable."
      });
    }
    res.sendFile(filePath);
  });
});

// 3. Autres pages avec contrôle token
app.get('/control-level1.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/supervisor-control.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor-control.html'));
});

app.get('/master-dashboard.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

app.get('/lotato.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

// === MIDDLEWARE DE GESTION D'ERREURS ===
app.use((err, req, res, next) => {
  if (err) {
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur interne'
    });
  }
  next();
});

// === DÉMARRAGE DU SERVEUR ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📁 Compression GZIP activée`);
  console.log(`⚡ Application optimisée pour la performance`);
  console.log(`🎰 LOTATO backend prêt à fonctionner`);
});