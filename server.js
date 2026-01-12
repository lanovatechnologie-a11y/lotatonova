const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

// Middleware CORS
app.use(cors());

// Middleware standard
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve tous les fichiers statiques à la racine
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Connexion MongoDB avec URI de Render
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://novalotto:novalotto123@novalotto.7z4wx.mongodb.net/lottodb?retryWrites=true&w=majority&appName=novalotto';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Connexion MongoDB échouée'));
db.once('open', () => {
  console.log('✅ MongoDB connecté avec succès !');
});

// =================== SCHÉMAS ===================

// Schema utilisateur
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String },
  role: {
    type: String,
    enum: ['master', 'subsystem', 'supervisor', 'agent'],
    required: true
  },
  level: { type: Number, default: 1 },
  dateCreation: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Schéma pour les paris
const betSchema = new mongoose.Schema({
  type: { type: String, required: true },
  name: { type: String, required: true },
  number: { type: String, required: true },
  amount: { type: Number, required: true },
  multiplier: { type: Number, required: true },
  options: { type: mongoose.Schema.Types.Mixed },
  perOptionAmount: { type: Number },
  isLotto4: { type: Boolean, default: false },
  isLotto5: { type: Boolean, default: false },
  isAuto: { type: Boolean, default: false },
  isGroup: { type: Boolean, default: false },
  details: { type: mongoose.Schema.Types.Mixed }
});

// Schéma pour les fiches
const ticketSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true },
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  date: { type: Date, default: Date.now },
  bets: [betSchema],
  total: { type: Number, required: true },
  agent_id: { type: String },
  agent_name: { type: String, required: true },
  is_printed: { type: Boolean, default: false },
  printed_at: { type: Date },
  is_synced: { type: Boolean, default: false },
  synced_at: { type: Date }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

// =================== MIDDLEWARE DE VÉRIFICATION DE TOKEN ===================

function vérifierToken(req, res, next) {
  let token = req.query.token;
  
  if (!token && req.body) {
    token = req.body.token;
  }
  
  if (!token) {
    token = req.headers['authorization'];
    if (token && token.startsWith('Bearer ')) {
      token = token.slice(7);
    }
  }
  
  if (!token) {
    token = req.headers['x-auth-token'];
  }
  
  // Pour le développement, permettre les requêtes sans token
  if (!token || !token.startsWith('nova_')) {
    // Ne pas bloquer les requêtes API pour faciliter le développement
    // Vous pouvez activer cette vérification plus tard
    req.tokenInfo = {
      token: 'dev_token',
      userId: 'dev_user',
      role: 'agent',
      level: '1'
    };
  } else if (token && token.startsWith('nova_')) {
    const parts = token.split('_');
    if (parts.length >= 5) {
      req.tokenInfo = {
        token: token,
        userId: parts[2],
        role: parts[3],
        level: parts[4] || '1'
      };
    }
  }
  
  next();
}

// =================== ROUTES API POUR LOTATO ===================

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Route de connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    console.log('Tentative de connexion:', { username, role });
    
    // Pour le développement, accepter n'importe quel identifiant
    const token = `nova_${Date.now()}_dev123_agent_1`;
    
    res.json({
      success: true,
      redirectUrl: '/lotato.html',
      token: token,
      user: {
        id: 'dev123',
        username: username,
        name: username,
        role: 'agent',
        level: 1
      }
    });

  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la connexion'
    });
  }
});

// Route pour sauvegarder une fiche (POST /api/tickets)
app.post('/api/tickets', vérifierToken, async (req, res) => {
  try {
    console.log('Requête POST /api/tickets reçue:', req.body);
    
    const { draw, draw_time, bets, agentId, agentName } = req.body;
    
    if (!draw || !draw_time || !bets || !Array.isArray(bets)) {
      return res.status(400).json({
        success: false,
        error: 'Données invalides. draw, draw_time et bets sont requis.'
      });
    }
    
    // Trouver le dernier numéro de ticket
    const lastTicket = await Ticket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;
    
    // Calculer le total
    const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
    
    // Créer le ticket
    const ticket = new Ticket({
      number: ticketNumber,
      draw: draw,
      draw_time: draw_time,
      bets: bets,
      total: total,
      agent_id: agentId || 'dev123',
      agent_name: agentName || 'Agent Démo',
      date: new Date()
    });
    
    console.log('Sauvegarde du ticket:', {
      number: ticketNumber,
      draw: draw,
      draw_time: draw_time,
      nbBets: bets.length,
      total: total
    });
    
    await ticket.save();
    
    console.log('Ticket sauvegardé avec succès:', ticketNumber);
    
    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        number: ticket.number,
        date: ticket.date,
        draw: ticket.draw,
        draw_time: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total,
        agent_name: ticket.agent_name
      },
      nextTicketNumber: ticketNumber + 1,
      message: 'Fiche sauvegardée avec succès'
    });
    
  } catch (error) {
    console.error('Erreur détaillée sauvegarde fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde de la fiche: ' + error.message
    });
  }
});

// Route pour obtenir toutes les fiches (GET /api/tickets)
app.get('/api/tickets', vérifierToken, async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .sort({ date: -1 })
      .limit(100);
    
    const lastTicket = await Ticket.findOne().sort({ number: -1 });
    const nextTicketNumber = lastTicket ? lastTicket.number + 1 : 100001;
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.date,
        draw: ticket.draw,
        draw_time: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total,
        agent_name: ticket.agent_name
      })),
      nextTicketNumber: nextTicketNumber
    });
  } catch (error) {
    console.error('Erreur chargement fiches:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des fiches'
    });
  }
});

// Route pour les fiches en attente (GET /api/tickets/pending)
app.get('/api/tickets/pending', vérifierToken, async (req, res) => {
  try {
    const tickets = await Ticket.find({ is_synced: false })
      .sort({ date: -1 })
      .limit(50);
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.date,
        draw: ticket.draw,
        draw_time: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total,
        agent_name: ticket.agent_name
      }))
    });
  } catch (error) {
    console.error('Erreur tickets en attente:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des tickets en attente'
    });
  }
});

// Route pour l'historique (POST /api/history)
app.post('/api/history', vérifierToken, async (req, res) => {
  try {
    const historyRecord = req.body;
    
    // Simplement retourner un succès pour le moment
    res.json({
      success: true,
      message: 'Historique sauvegardé avec succès'
    });
  } catch (error) {
    console.error('Erreur sauvegarde historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde de l\'historique'
    });
  }
});

// Route pour obtenir l'historique (GET /api/history)
app.get('/api/history', vérifierToken, async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .sort({ date: -1 })
      .limit(50);
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.date,
        draw: ticket.draw,
        draw_time: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total,
        agent_name: ticket.agent_name
      }))
    });
  } catch (error) {
    console.error('Erreur chargement historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement de l\'historique'
    });
  }
});

// Route pour les fiches gagnantes (GET /api/tickets/winning)
app.get('/api/tickets/winning', vérifierToken, async (req, res) => {
  try {
    res.json({
      success: true,
      tickets: []
    });
  } catch (error) {
    console.error('Erreur chargement gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des gagnants'
    });
  }
});

// Route pour les résultats (GET /api/results)
app.get('/api/results', vérifierToken, async (req, res) => {
  try {
    const results = {
      'miami': {
        'morning': {
          date: new Date().toISOString(),
          lot1: '123',
          lot2: '45',
          lot3: '67'
        },
        'evening': {
          date: new Date().toISOString(),
          lot1: '456',
          lot2: '78',
          lot3: '90'
        }
      },
      'georgia': {
        'morning': {
          date: new Date().toISOString(),
          lot1: '234',
          lot2: '56',
          lot3: '78'
        }
      },
      'newyork': {
        'morning': {
          date: new Date().toISOString(),
          lot1: '345',
          lot2: '67',
          lot3: '89'
        }
      },
      'texas': {
        'morning': {
          date: new Date().toISOString(),
          lot1: '456',
          lot2: '78',
          lot3: '90'
        }
      },
      'tunisia': {
        'morning': {
          date: new Date().toISOString(),
          lot1: '567',
          lot2: '89',
          lot3: '01'
        }
      }
    };
    
    res.json({
      success: true,
      results: results
    });
  } catch (error) {
    console.error('Erreur chargement résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des résultats'
    });
  }
});

// Route pour vérifier les gagnants (POST /api/check-winners)
app.post('/api/check-winners', vérifierToken, async (req, res) => {
  try {
    res.json({
      success: true,
      winningTickets: []
    });
  } catch (error) {
    console.error('Erreur vérification gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification des gagnants'
    });
  }
});

// Route pour les informations de l'entreprise (GET /api/company-info)
app.get('/api/company-info', vérifierToken, async (req, res) => {
  try {
    res.json({
      success: true,
      company_name: 'Nova Lotto',
      company_phone: '+509 32 53 49 58',
      company_address: 'Cap Haïtien',
      report_title: 'Nova Lotto',
      report_phone: '40104585'
    });
  } catch (error) {
    console.error('Erreur chargement info entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des informations de l\'entreprise'
    });
  }
});

// Route pour le logo (GET /api/logo)
app.get('/api/logo', vérifierToken, async (req, res) => {
  try {
    res.json({
      success: true,
      logoUrl: 'logo-borlette.jpg'
    });
  } catch (error) {
    console.error('Erreur chargement logo:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du logo'
    });
  }
});

// Route pour vérifier la session (GET /api/auth/check)
app.get('/api/auth/check', vérifierToken, async (req, res) => {
  try {
    res.json({
      success: true,
      admin: {
        id: 'dev123',
        username: 'admin',
        name: 'Admin Démo',
        role: 'agent',
        level: 1
      }
    });
  } catch (error) {
    console.error('Erreur vérification session:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification de la session'
    });
  }
});

// =================== ROUTES HTML ===================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/*.html', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send('Page non trouvée');
    }
    
    res.sendFile(filePath);
  });
});

app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

// =================== DÉMARRAGE DU SERVEUR ===================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur LOTATO démarré sur le port ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🎰 LOTATO: http://localhost:${PORT}/lotato.html`);
  console.log(`✅ Routes API disponibles:`);
  console.log(`   POST /api/tickets - Sauvegarder une fiche`);
  console.log(`   GET  /api/tickets - Récupérer toutes les fiches`);
  console.log(`   GET  /api/tickets/pending - Fiches en attente`);
  console.log(`   GET  /api/results - Résultats des tirages`);
  console.log(`   POST /api/auth/login - Connexion`);
  console.log(`   GET  /api/health - Vérifier l'état du serveur`);
});