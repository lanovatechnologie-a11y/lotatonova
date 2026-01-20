const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const cors = require('cors');

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

// Middleware CORS
app.use(cors());

// Middleware standard
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve tous les fichiers statiques à la racine avec compression GZIP
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
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

// =================== SCHÉMAS SIMPLES ===================

// Schema utilisateur simple
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String },
  email: { type: String },
  role: {
    type: String,
    enum: ['master', 'subsystem', 'supervisor', 'agent'],
    required: true
  },
  level: { type: Number, default: 1 },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  supervisor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  supervisor2_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  is_active: { type: Boolean, default: true },
  dateCreation: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// =================== NOUVEAUX SCHÉMAS POUR LOTATO ===================

// Schéma pour les tirages
const drawSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  icon: { type: String, default: 'fas fa-dice' },
  times: {
    morning: { type: String, required: true },
    evening: { type: String, required: true }
  },
  is_active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

const Draw = mongoose.model('Draw', drawSchema);

// Schéma pour les résultats
const resultSchema = new mongoose.Schema({
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  date: { type: Date, required: true },
  lot1: { type: String, required: true },
  lot2: { type: String },
  lot3: { type: String },
  verified: { type: Boolean, default: false },
  verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verified_at: { type: Date }
});

const Result = mongoose.model('Result', resultSchema);

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
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_name: { type: String, required: true },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  is_printed: { type: Boolean, default: false },
  printed_at: { type: Date },
  is_synced: { type: Boolean, default: false },
  synced_at: { type: Date }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

// Schéma pour les fiches multi-tirages
const multiDrawTicketSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true },
  date: { type: Date, default: Date.now },
  bets: [{
    gameType: { type: String, required: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    draws: [{ type: String }],
    options: { type: mongoose.Schema.Types.Mixed }
  }],
  draws: [{ type: String }],
  total: { type: Number, required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_name: { type: String, required: true },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  is_printed: { type: Boolean, default: false },
  printed_at: { type: Date }
});

const MultiDrawTicket = mongoose.model('MultiDrawTicket', multiDrawTicketSchema);

// Schéma pour les gagnants
const winnerSchema = new mongoose.Schema({
  ticket_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
  ticket_number: { type: Number, required: true },
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  date: { type: Date, default: Date.now },
  winning_bets: [{
    type: { type: String },
    name: { type: String },
    number: { type: String },
    matched_number: { type: String },
    win_type: { type: String },
    win_amount: { type: Number }
  }],
  total_winnings: { type: Number, required: true },
  paid: { type: Boolean, default: false },
  paid_at: { type: Date },
  paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const Winner = mongoose.model('Winner', winnerSchema);

// Schéma pour la configuration
const configSchema = new mongoose.Schema({
  company_name: { type: String, default: 'Nova Lotto' },
  company_phone: { type: String, default: '+509 32 53 49 58' },
  company_address: { type: String, default: 'Cap Haïtien' },
  report_title: { type: String, default: 'Nova Lotto' },
  report_phone: { type: String, default: '40104585' },
  logo_url: { type: String, default: 'logo-borlette.jpg' }
});

const Config = mongoose.model('Config', configSchema);

// Schéma pour l'historique des soumissions de paris
const historySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  bets: [betSchema],
  total: { type: Number, required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_name: { type: String, required: true }
});

const History = mongoose.model('History', historySchema);

// =================== SCHÉMAS POUR LES SOUS-SYSTÈMES ===================

const subsystemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subdomain: { type: String, required: true, unique: true },
  contact_email: { type: String, required: true },
  contact_phone: { type: String },
  max_users: { type: Number, default: 10 },
  subscription_type: { 
    type: String, 
    enum: ['basic', 'standard', 'premium', 'enterprise'], 
    default: 'standard' 
  },
  subscription_months: { type: Number, default: 1 },
  subscription_expires: { type: Date },
  admin_user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  stats: {
    active_users: { type: Number, default: 0 },
    today_sales: { type: Number, default: 0 },
    today_tickets: { type: Number, default: 0 },
    usage_percentage: { type: Number, default: 0 }
  }
});

const Subsystem = mongoose.model('Subsystem', subsystemSchema);

// =================== MIDDLEWARE DE VÉRIFICATION DE TOKEN ===================

function vérifierToken(req, res, next) {
  let token = req.query.token;
  
  if (!token && req.body) {
    token = req.body.token;
  }
  
  if (!token) {
    token = req.headers['x-auth-token'];
  }
  
  // Ajoutez cette partie pour gérer Bearer token
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Enlever "Bearer "
    }
  }
  
  if (!token || !token.startsWith('nova_')) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token manquant ou invalide' 
      });
    }
  }
  
  if (token && token.startsWith('nova_')) {
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

// =================== ROUTES POUR LE MASTER DASHBOARD ===================

// Route d'initialisation master
app.post('/api/master/init', async (req, res) => {
  try {
    const { masterUsername, masterPassword, companyName, masterEmail } = req.body;
    
    // Vérifier si un master existe déjà
    const existingMaster = await User.findOne({ role: 'master' });
    if (existingMaster) {
      return res.status(400).json({
        success: false,
        error: 'Un compte master existe déjà'
      });
    }
    
    // Créer l'utilisateur master
    const masterUser = new User({
      username: masterUsername || 'master',
      password: masterPassword || 'master123',
      name: companyName || 'Master Admin',
      email: masterEmail || 'master@novalotto.com',
      role: 'master',
      level: 1
    });
    
    await masterUser.save();
    
    const token = `nova_${Date.now()}_${masterUser._id}_master_1`;
    
    res.json({
      success: true,
      token: token,
      user: {
        id: masterUser._id,
        username: masterUser.username,
        name: masterUser.name,
        role: masterUser.role,
        level: masterUser.level,
        email: masterUser.email,
        full_name: masterUser.name
      }
    });
    
  } catch (error) {
    console.error('Erreur initialisation master:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'initialisation'
    });
  }
});

// Route de connexion master
app.post('/api/master/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ 
      username: username,
      password: password,
      role: 'master'
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants master incorrects'
      });
    }
    
    const token = `nova_${Date.now()}_${user._id}_master_1`;
    
    res.json({
      success: true,
      token: token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email,
        full_name: user.name
      }
    });
    
  } catch (error) {
    console.error('Erreur connexion master:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la connexion'
    });
  }
});

// Route pour vérifier la session master
app.get('/api/master/check-session', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }
    
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
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
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email,
        full_name: user.name
      }
    });
    
  } catch (error) {
    console.error('Erreur vérification session master:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification de la session'
    });
  }
});

// =================== ROUTES DE CONNEXION GÉNÉRALES ===================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    console.log('Tentative de connexion:', { username, password, role });
    
    // Gérer les rôles supervisor1 et supervisor2
    let dbRole = role;
    let level = 1;
    
    if (role === 'supervisor1' || role === 'supervisor2') {
      dbRole = 'supervisor';
      level = role === 'supervisor1' ? 1 : 2;
    }
    
    const user = await User.findOne({ 
      username,
      password,
      role: dbRole
    });

    if (!user) {
      console.log('Utilisateur non trouvé ou informations incorrectes');
      return res.status(401).json({
        success: false,
        error: 'Identifiants ou rôle incorrect'
      });
    }

    // Vérifier le niveau pour les superviseurs
    if (dbRole === 'supervisor') {
      // Convertir le niveau en nombre pour la comparaison
      const userLevel = parseInt(user.level || 1);
      if (userLevel !== level) {
        console.log('Niveau de superviseur incorrect');
        return res.status(401).json({
          success: false,
          error: 'Niveau de superviseur incorrect'
        });
      }
    }

    console.log('Utilisateur trouvé:', user.username, user.role, user.level);

    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;

    let redirectUrl;
    switch (user.role) {
      case 'agent':
        redirectUrl = '/lotato.html';
        break;
      case 'supervisor':
        if (user.level == 1) {
          redirectUrl = '/control-level1.html';
        } else if (user.level == 2) {
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

    redirectUrl += `?token=${encodeURIComponent(token)}`;

    res.json({
      success: true,
      redirectUrl: redirectUrl,
      token: token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email
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
// =================== NOUVELLES ROUTES POUR LOTATO ===================

// Route pour enregistrer un historique
app.post('/api/history', vérifierToken, async (req, res) => {
  try {
    const { draw, drawTime, bets, total } = req.body;

    if (!draw || !drawTime || !bets || total === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Données manquantes pour l\'historique'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const history = new History({
      date: new Date(),
      draw: draw,
      draw_time: drawTime,
      bets: bets,
      total: total,
      agent_id: user._id,
      agent_name: user.name
    });

    await history.save();

    res.json({
      success: true,
      message: 'Historique enregistré avec succès'
    });
  } catch (error) {
    console.error('Erreur enregistrement historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement de l\'historique'
    });
  }
});

// Route pour récupérer l'historique de l'agent
app.get('/api/history', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const history = await History.find({ agent_id: user._id })
      .skip(skip)
      .limit(limit)
      .sort({ date: -1 });

    const total = await History.countDocuments({ agent_id: user._id });

    res.json({
      success: true,
      history: history.map(record => ({
        id: record._id,
        date: record.date,
        draw: record.draw,
        draw_time: record.draw_time,
        bets: record.bets,
        total: record.total
      })),
      pagination: {
        page: page,
        limit: limit,
        total: total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur récupération historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de l\'historique'
    });
  }
});

// Route pour obtenir les tickets de l'agent
app.get('/api/tickets', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const tickets = await Ticket.find({ agent_id: user._id })
      .sort({ date: -1 })
      .limit(100);

    // Trouver le prochain numéro de ticket
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
    console.error('Erreur chargement tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des tickets'
    });
  }
});

// Route pour sauvegarder un ticket (modifiée pour utiliser le token)
app.post('/api/tickets', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time, bets } = req.body;

    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const lastTicket = await Ticket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;

    const total = bets.reduce((sum, bet) => sum + bet.amount, 0);

    const ticket = new Ticket({
      number: ticketNumber,
      draw: draw,
      draw_time: draw_time,
      bets: bets,
      total: total,
      agent_id: user._id,
      agent_name: user.name,
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
        draw_time: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total,
        agent_name: ticket.agent_name
      }
    });
  } catch (error) {
    console.error('Erreur sauvegarde fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde de la fiche'
    });
  }
});

// Route pour les tickets en attente de l'agent
app.get('/api/tickets/pending', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const tickets = await Ticket.find({ 
      agent_id: user._id,
      is_synced: false 
    })
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

// Route pour sauvegarder un ticket en attente
app.post('/api/tickets/pending', vérifierToken, async (req, res) => {
  try {
    const { ticket } = req.body;

    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const lastTicket = await Ticket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;

    const newTicket = new Ticket({
      number: ticketNumber,
      draw: ticket.draw,
      draw_time: ticket.drawTime,
      bets: ticket.bets,
      total: ticket.total,
      agent_id: user._id,
      agent_name: user.name,
      date: new Date(),
      is_synced: false
    });

    await newTicket.save();

    res.json({
      success: true,
      ticket: {
        id: newTicket._id,
        number: newTicket.number,
        date: newTicket.date,
        draw: newTicket.draw,
        draw_time: newTicket.draw_time,
        bets: newTicket.bets,
        total: newTicket.total,
        agent_name: newTicket.agent_name
      }
    });
  } catch (error) {
    console.error('Erreur sauvegarde ticket en attente:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde du ticket en attente'
    });
  }
});

// Route pour les tickets gagnants de l'agent
app.get('/api/tickets/winning', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const winners = await Winner.find({ agent_id: user._id })
      .sort({ date: -1 })
      .limit(50);

    res.json({
      success: true,
      tickets: winners.map(winner => ({
        id: winner._id,
        ticket_number: winner.ticket_number,
        date: winner.date,
        draw: winner.draw,
        draw_time: winner.draw_time,
        winning_bets: winner.winning_bets,
        total_winnings: winner.total_winnings,
        paid: winner.paid
      }))
    });
  } catch (error) {
    console.error('Erreur chargement gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des gagnants'
    });
  }
});

// Route pour les fiches multi-tirages de l'agent
app.get('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const tickets = await MultiDrawTicket.find({ agent_id: user._id })
      .sort({ date: -1 })
      .limit(50);
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.date,
        bets: ticket.bets,
        draws: ticket.draws,
        total: ticket.total,
        agent_name: ticket.agent_name
      }))
    });
  } catch (error) {
    console.error('Erreur fiches multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des fiches multi-tirages'
    });
  }
});

// Route pour sauvegarder une fiche multi-tirages
app.post('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
  try {
    const { ticket } = req.body;

    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const lastTicket = await MultiDrawTicket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 500001;

    const multiDrawTicket = new MultiDrawTicket({
      number: ticketNumber,
      date: new Date(),
      bets: ticket.bets,
      draws: Array.from(ticket.draws),
      total: ticket.totalAmount,
      agent_id: user._id,
      agent_name: user.name
    });

    await multiDrawTicket.save();

    res.json({
      success: true,
      ticket: {
        id: multiDrawTicket._id,
        number: multiDrawTicket.number,
        date: multiDrawTicket.date,
        bets: multiDrawTicket.bets,
        draws: multiDrawTicket.draws,
        total: multiDrawTicket.total,
        agent_name: multiDrawTicket.agent_name
      }
    });
  } catch (error) {
    console.error('Erreur sauvegarde fiche multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde de la fiche multi-tirages'
    });
  }
});

// Route pour obtenir les informations de l'entreprise
app.get('/api/company-info', vérifierToken, async (req, res) => {
  try {
    let config = await Config.findOne();
    
    if (!config) {
      config = new Config();
      await config.save();
    }
    
    res.json({
      success: true,
      company_name: config.company_name,
      company_phone: config.company_phone,
      company_address: config.company_address,
      report_title: config.report_title,
      report_phone: config.report_phone
    });
  } catch (error) {
    console.error('Erreur chargement info entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des informations de l\'entreprise'
    });
  }
});

// Route pour le logo
app.get('/api/logo', vérifierToken, async (req, res) => {
  try {
    const config = await Config.findOne();
    
    res.json({
      success: true,
      logoUrl: config ? config.logo_url : 'logo-borlette.jpg'
    });
  } catch (error) {
    console.error('Erreur chargement logo:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du logo'
    });
  }
});

// Route pour les résultats
app.get('/api/results', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time, date } = req.query;
    
    let query = {};
    if (draw) query.draw = draw;
    if (draw_time) query.draw_time = draw_time;
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }
    
    const results = await Result.find(query)
      .sort({ date: -1 })
      .limit(50);
    
    // Convertir en format attendu par lotato.html
    const resultsDatabase = {};
    results.forEach(result => {
      if (!resultsDatabase[result.draw]) {
        resultsDatabase[result.draw] = {};
      }
      resultsDatabase[result.draw][result.draw_time] = {
        date: result.date,
        lot1: result.lot1,
        lot2: result.lot2 || '',
        lot3: result.lot3 || ''
      };
    });
    
    res.json({
      success: true,
      results: resultsDatabase
    });
  } catch (error) {
    console.error('Erreur chargement résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des résultats'
    });
  }
});

// Route pour vérifier les gagnants
app.post('/api/check-winners', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time } = req.body;
    
    // Récupérer le résultat du tirage
    const result = await Result.findOne({ 
      draw: draw,
      draw_time: draw_time 
    }).sort({ date: -1 });
    
    if (!result) {
      return res.json({
        success: true,
        winningTickets: [],
        message: 'Aucun résultat trouvé pour ce tirage'
      });
    }
    
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
    
    // Récupérer les tickets de l'agent pour ce tirage
    const tickets = await Ticket.find({
      agent_id: user._id,
      draw: draw,
      draw_time: draw_time,
      date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });
    
    const winningTickets = [];
    
    // Vérifier chaque ticket
    for (const ticket of tickets) {
      const winningBets = [];
      
      for (const bet of ticket.bets) {
        let winAmount = 0;
        let winType = '';
        let matchedNumber = '';
        
        // Logique de vérification des gains
        if (bet.type === 'borlette' || bet.type === 'boulpe') {
          const lot1Last2 = result.lot1.substring(1);
          
          if (bet.number === lot1Last2) {
            winAmount = bet.amount * 60;
            winType = '1er lot';
            matchedNumber = lot1Last2;
          } else if (bet.number === result.lot2) {
            winAmount = bet.amount * 20;
            winType = '2e lot';
            matchedNumber = result.lot2;
          } else if (bet.number === result.lot3) {
            winAmount = bet.amount * 10;
            winType = '3e lot';
            matchedNumber = result.lot3;
          }
        } else if (bet.type === 'lotto3') {
          if (bet.number === result.lot1) {
            winAmount = bet.amount * 500;
            winType = 'Lotto 3';
            matchedNumber = result.lot1;
          }
        } else if (bet.type === 'marriage') {
          const [num1, num2] = bet.number.split('*');
          const numbers = [result.lot1.substring(1), result.lot2, result.lot3];
          
          if (numbers.includes(num1) && numbers.includes(num2)) {
            winAmount = bet.amount * 1000;
            winType = 'Maryaj';
            matchedNumber = `${num1}*${num2}`;
          }
        } else if (bet.type === 'grap') {
          if (result.lot1[0] === result.lot1[1] && result.lot1[1] === result.lot1[2]) {
            if (bet.number === result.lot1) {
              winAmount = bet.amount * 500;
              winType = 'Grap';
              matchedNumber = result.lot1;
            }
          }
        }
        
        if (winAmount > 0) {
          winningBets.push({
            type: bet.type,
            name: bet.name,
            number: bet.number,
            matched_number: matchedNumber,
            win_type: winType,
            win_amount: winAmount
          });
        }
      }
      
      if (winningBets.length > 0) {
        const totalWinnings = winningBets.reduce((sum, bet) => sum + bet.win_amount, 0);
        
        // Créer un enregistrement de gagnant
        const winner = new Winner({
          ticket_id: ticket._id,
          ticket_number: ticket.number,
          draw: ticket.draw,
          draw_time: ticket.draw_time,
          date: new Date(),
          winning_bets: winningBets,
          total_winnings: totalWinnings,
          agent_id: user._id
        });
        
        await winner.save();
        
        winningTickets.push({
          id: ticket._id,
          number: ticket.number,
          date: ticket.date,
          draw: ticket.draw,
          draw_time: ticket.draw_time,
          result: {
            lot1: result.lot1,
            lot2: result.lot2,
            lot3: result.lot3
          },
          winningBets: winningBets,
          totalWinnings: totalWinnings
        });
      }
    }
    
    res.json({
      success: true,
      winningTickets: winningTickets
    });
  } catch (error) {
    console.error('Erreur vérification gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification des gagnants'
    });
  }
});

// =================== ROUTES POUR LES ADMINISTRATEURS DE SOUS-SYSTÈMES ===================

// Route pour créer un utilisateur (agent/superviseur) dans le sous-système
app.post('/api/subsystem/users/create', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
    if (!user || user.role !== 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle subsystem requis.'
      });
    }

    const { name, username, password, role, level } = req.body;
    
    if (!name || !username || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'Tous les champs obligatoires sont requis'
      });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Cet identifiant est déjà utilisé'
      });
    }

    // Récupérer le sous-système de l'admin
    const subsystem = await Subsystem.findOne({ admin_user: user._id });
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Vérifier la limite d'utilisateurs
    const userCount = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      role: { $in: ['agent', 'supervisor'] }
    });
    
    if (userCount >= subsystem.max_users) {
      return res.status(400).json({
        success: false,
        error: `Limite d'utilisateurs atteinte (${subsystem.max_users} maximum)`
      });
    }

    // Déterminer le rôle API
    let apiRole = role;
    if (role === 'supervisor1' || role === 'supervisor2') {
      apiRole = 'supervisor';
    }

    const newUser = new User({
      username,
      password,
      name,
      role: apiRole,
      level: level || (role === 'supervisor2' ? 2 : 1),
      subsystem_id: subsystem._id,
      is_active: true
    });

    await newUser.save();

    // Mettre à jour les statistiques du sous-système
    await Subsystem.findByIdAndUpdate(subsystem._id, {
      $inc: { 'stats.active_users': 1 }
    });

    res.json({
      success: true,
      message: 'Utilisateur créé avec succès',
      user: {
        id: newUser._id,
        name: newUser.name,
        username: newUser.username,
        role: newUser.role,
        level: newUser.level
      }
    });

  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création de l\'utilisateur'
    });
  }
});

// Route pour lister les utilisateurs du sous-système
app.get('/api/subsystem/users', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
    if (!user || user.role !== 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle subsystem requis.'
      });
    }

    // Récupérer le sous-système de l'admin
    const subsystem = await Subsystem.findOne({ admin_user: user._id });
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const { role, status } = req.query;
    let query = { subsystem_id: subsystem._id };

    // Filtrer par rôle si spécifié
    if (role) {
      if (role === 'supervisor1') {
        query.role = 'supervisor';
        query.level = 1;
      } else if (role === 'supervisor2') {
        query.role = 'supervisor';
        query.level = 2;
      } else {
        query.role = role;
      }
    }

    // Filtrer par statut si spécifié
    if (status) {
      query.is_active = status === 'active';
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ dateCreation: -1 });

    // Ajouter des statistiques pour chaque utilisateur
    const usersWithStats = await Promise.all(users.map(async (user) => {
      // Statistiques pour les agents
      if (user.role === 'agent') {
        const tickets = await Ticket.find({ agent_id: user._id });
        const total_sales = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
        const total_tickets = tickets.length;
        
        // Chercher les gagnants pour calculer les gains
        const winners = await Winner.find({ agent_id: user._id });
        const total_winnings = winners.reduce((sum, winner) => sum + winner.total_winnings, 0);

        return {
          ...user.toObject(),
          total_sales,
          total_tickets,
          total_winnings,
          is_online: Math.random() > 0.3 // Simulation d'état en ligne
        };
      }

      // Statistiques pour les superviseurs
      if (user.role === 'supervisor') {
        const agents = await User.find({ 
          subsystem_id: subsystem._id,
          role: 'agent',
          $or: [
            { supervisor_id: user._id },
            { supervisor2_id: user._id }
          ]
        });

        const agentIds = agents.map(a => a._id);
        const tickets = await Ticket.find({ agent_id: { $in: agentIds } });
        const total_sales = tickets.reduce((sum, ticket) => sum + ticket.total, 0);

        return {
          ...user.toObject(),
          agents_count: agents.length,
          total_sales,
          is_online: Math.random() > 0.3
        };
      }

      return user.toObject();
    }));

    res.json({
      success: true,
      users: usersWithStats
    });

  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des utilisateurs'
    });
  }
});

// Route pour activer/désactiver un utilisateur
app.put('/api/subsystem/users/:id/status', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const admin = await User.findById(req.tokenInfo.userId);
    if (!admin || admin.role !== 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle subsystem requis.'
      });
    }

    const userId = req.params.id;
    const { is_active } = req.body;

    // Vérifier que l'utilisateur appartient au même sous-système
    const subsystem = await Subsystem.findOne({ admin_user: admin._id });
    const user = await User.findOne({
      _id: userId,
      subsystem_id: subsystem._id
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé dans votre sous-système'
      });
    }

    user.is_active = is_active;
    await user.save();

    // Mettre à jour les statistiques du sous-système
    if (is_active) {
      await Subsystem.findByIdAndUpdate(subsystem._id, {
        $inc: { 'stats.active_users': 1 }
      });
    } else {
      await Subsystem.findByIdAndUpdate(subsystem._id, {
        $inc: { 'stats.active_users': -1 }
      });
    }

    res.json({
      success: true,
      message: `Utilisateur ${is_active ? 'activé' : 'désactivé'} avec succès`
    });

  } catch (error) {
    console.error('Erreur changement statut:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors du changement de statut'
    });
  }
});

// Route pour modifier un utilisateur
app.put('/api/subsystem/users/:id', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const admin = await User.findById(req.tokenInfo.userId);
    if (!admin || admin.role !== 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle subsystem requis.'
      });
    }

    const userId = req.params.id;
    const { name, level, password } = req.body;

    // Vérifier que l'utilisateur appartient au même sous-système
    const subsystem = await Subsystem.findOne({ admin_user: admin._id });
    const user = await User.findOne({
      _id: userId,
      subsystem_id: subsystem._id
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé dans votre sous-système'
      });
    }

    // Mettre à jour les champs
    if (name) user.name = name;
    if (level) user.level = level;
    if (password) user.password = password;

    await user.save();

    res.json({
      success: true,
      message: 'Utilisateur modifié avec succès',
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        level: user.level
      }
    });

  } catch (error) {
    console.error('Erreur modification utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la modification de l\'utilisateur'
    });
  }
});

// Route pour assigner un superviseur à un agent
app.post('/api/subsystem/assign', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const admin = await User.findById(req.tokenInfo.userId);
    if (!admin || admin.role !== 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle subsystem requis.'
      });
    }

    const { userId, supervisorId, supervisorType } = req.body;

    // Vérifier que tous les utilisateurs appartiennent au même sous-système
    const subsystem = await Subsystem.findOne({ admin_user: admin._id });
    
    const user = await User.findOne({
      _id: userId,
      subsystem_id: subsystem._id
    });

    const supervisor = await User.findOne({
      _id: supervisorId,
      subsystem_id: subsystem._id
    });

    if (!user || !supervisor) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur ou superviseur non trouvé dans votre sous-système'
      });
    }

    // Assigner selon le type
    if (supervisorType === 'supervisor1') {
      user.supervisor_id = supervisorId;
    } else if (supervisorType === 'supervisor2') {
      user.supervisor2_id = supervisorId;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Assignation réussie'
    });

  } catch (error) {
    console.error('Erreur assignation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de l\'assignation'
    });
  }
});

// Route pour les statistiques du sous-système
app.get('/api/subsystem/stats', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const admin = await User.findById(req.tokenInfo.userId);
    if (!admin || admin.role !== 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle subsystem requis.'
      });
    }

    // Récupérer le sous-système
    const subsystem = await Subsystem.findOne({ admin_user: admin._id });
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Statistiques d'aujourd'hui
    const todayTickets = await Ticket.find({
      subsystem_id: subsystem._id,
      date: { $gte: today }
    });

    const todaySales = todayTickets.reduce((sum, ticket) => sum + ticket.total, 0);

    // Statistiques du mois
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyTickets = await Ticket.find({
      subsystem_id: subsystem._id,
      date: { $gte: firstDayOfMonth }
    });

    const monthlySales = monthlyTickets.reduce((sum, ticket) => sum + ticket.total, 0);

    // Compter les utilisateurs
    const totalUsers = await User.countDocuments({ subsystem_id: subsystem._id });
    const activeUsers = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      is_active: true 
    });

    // Calculer le profit (estimation: 30% des ventes)
    const monthlyProfit = monthlySales * 0.3;

    res.json({
      success: true,
      stats: {
        today_tickets: todayTickets.length,
        today_sales: todaySales,
        monthly_tickets: monthlyTickets.length,
        monthly_sales: monthlySales,
        monthly_profit: monthlyProfit,
        total_users: totalUsers,
        active_users: activeUsers,
        max_users: subsystem.max_users,
        usage_percentage: Math.round((activeUsers / subsystem.max_users) * 100)
      }
    });

  } catch (error) {
    console.error('Erreur statistiques sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

// Route pour les activités du sous-système
app.get('/api/subsystem/activities', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const admin = await User.findById(req.tokenInfo.userId);
    if (!admin || admin.role !== 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle subsystem requis.'
      });
    }

    const subsystem = await Subsystem.findOne({ admin_user: admin._id });
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Récupérer les tickets récents (comme activité)
    const recentTickets = await Ticket.find({ subsystem_id: subsystem._id })
      .sort({ date: -1 })
      .limit(10)
      .populate('agent_id', 'name');

    const activities = recentTickets.map(ticket => ({
      timestamp: ticket.date,
      user: ticket.agent_name,
      action: 'Vente de ticket',
      details: `Ticket #${ticket.number} - ${ticket.total.toLocaleString()} HTG`
    }));

    res.json({
      success: true,
      activities
    });

  } catch (error) {
    console.error('Erreur activités sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des activités'
    });
  }
});

// Route pour les tickets du sous-système
app.get('/api/subsystem/tickets', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const admin = await User.findById(req.tokenInfo.userId);
    if (!admin || admin.role !== 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle subsystem requis.'
      });
    }

    const subsystem = await Subsystem.findOne({ admin_user: admin._id });
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const { period } = req.query;
    let startDate = new Date();

    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      // Aujourd'hui par défaut
      startDate.setHours(0, 0, 0, 0);
    }

    const tickets = await Ticket.find({
      subsystem_id: subsystem._id,
      date: { $gte: startDate }
    })
      .sort({ date: -1 })
      .limit(100)
      .populate('agent_id', 'name');

    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.date,
        agent_name: ticket.agent_name,
        draw: ticket.draw,
        draw_time: ticket.draw_time,
        total: ticket.total,
        is_synced: ticket.is_synced
      }))
    });

  } catch (error) {
    console.error('Erreur tickets sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des tickets'
    });
  }
});

// =================== ROUTES API EXISTANTES ===================

app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/api/auth/verify', (req, res) => {
  try {
    const token = req.query.token;
    
    if (!token || !token.startsWith('nova_')) {
      return res.json({
        success: false,
        valid: false
      });
    }
    
    res.json({
      success: true,
      valid: true
    });
  } catch (error) {
    res.json({
      success: false,
      valid: false
    });
  }
});

app.get('/api/statistics', vérifierToken, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeAgents = await User.countDocuments({ role: 'agent', is_active: true });
    const activeSupervisors = await User.countDocuments({ role: 'supervisor', is_active: true });
    const activeSubsystems = await User.countDocuments({ role: 'subsystem', is_active: true });
    
    // Calculer les ventes totales depuis les tickets
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayTickets = await Ticket.find({ date: { $gte: today } });
    const totalSales = todayTickets.reduce((sum, ticket) => sum + ticket.total, 0);
    
    const statistics = {
      active_agents: activeAgents,
      active_supervisors: activeSupervisors,
      active_subsystems: activeSubsystems,
      total_sales: totalSales,
      total_profit: Math.floor(totalSales * 0.3), // 30% de profit estimé
      total_users: totalUsers,
      today_tickets: todayTickets.length
    };
    
    res.json({
      success: true,
      statistics: statistics
    });
  } catch (error) {
    console.error('Erreur chargement statistiques:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des statistiques'
    });
  }
});

app.get('/api/agents', vérifierToken, async (req, res) => {
  try {
    const agents = await User.find({ 
      role: 'agent',
      is_active: true
    }).select('-password');
    
    const agentsWithStats = await Promise.all(agents.map(async (agent) => {
      // Calculer les statistiques réelles depuis la base de données
      const agentTickets = await Ticket.find({ agent_id: agent._id });
      const total_sales = agentTickets.reduce((sum, ticket) => sum + ticket.total, 0);
      const total_tickets = agentTickets.length;
      
      // Calculer les gains (pour la démo, on utilise un ratio)
      const winningTickets = await Winner.find({ agent_id: agent._id });
      const total_payout = winningTickets.reduce((sum, winner) => sum + winner.total_winnings, 0);
      const winning_tickets = winningTickets.length;
      
      // Vérifier si l'agent est en ligne (dernière activité dans les 5 minutes)
      const lastActive = agentTickets.length > 0 ? 
        Math.max(...agentTickets.map(t => t.date.getTime())) : 
        agent.dateCreation.getTime();
      
      const is_online = (Date.now() - lastActive) < (5 * 60 * 1000); // 5 minutes
      
      return {
        ...agent.toObject(),
        total_sales: total_sales,
        total_payout: total_payout,
        total_tickets: total_tickets,
        winning_tickets: winning_tickets,
        is_online: is_online,
        last_active: new Date(lastActive),
        subsystem_name: agent.subsystem_id ? 'Sous-système' : 'N/A'
      };
    }));
    
    res.json({
      success: true,
      agents: agentsWithStats
    });
  } catch (error) {
    console.error('Erreur chargement agents:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des agents'
    });
  }
});

app.get('/api/supervisors', vérifierToken, async (req, res) => {
  try {
    const supervisors = await User.find({ 
      role: 'supervisor',
      is_active: true
    }).select('-password');
    
    const supervisorsWithStats = await Promise.all(supervisors.map(async (supervisor) => {
      // Compter les agents sous la supervision
      const agents_count = await User.countDocuments({ 
        role: 'agent',
        subsystem_id: supervisor.subsystem_id
      });
      
      // Calculer les ventes des agents de ce superviseur
      const agentIds = await User.find({ 
        role: 'agent',
        subsystem_id: supervisor.subsystem_id
      }).select('_id');
      
      const agentIdsArray = agentIds.map(a => a._id);
      const agentTickets = await Ticket.find({ agent_id: { $in: agentIdsArray } });
      const total_sales = agentTickets.reduce((sum, ticket) => sum + ticket.total, 0);
      
      // Calculer les paiements
      const winningTickets = await Winner.find({ agent_id: { $in: agentIdsArray } });
      const total_payout = winningTickets.reduce((sum, winner) => sum + winner.total_winnings, 0);
      
      return {
        ...supervisor.toObject(),
        agents_count: agents_count,
        total_sales: total_sales,
        total_payout: total_payout,
        subsystem_name: supervisor.subsystem_id ? 'Sous-système' : 'N/A'
      };
    }));
    
    res.json({
      success: true,
      supervisors: supervisorsWithStats
    });
  } catch (error) {
    console.error('Erreur chargement superviseurs:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des superviseurs'
    });
  }
});

app.post('/api/agents/create', vérifierToken, async (req, res) => {
    try {
        const { name, email, level, password } = req.body;
        const newAgent = new User({
            username: email,
            password: password,
            name: name,
            role: 'agent',
            level: parseInt(level)
        });
        await newAgent.save();
        res.json({ success: true, message: 'Agent créé avec succès' });
    } catch (error) {
        console.error('Erreur création agent:', error);
        res.status(500).json({ success: false, error: 'Erreur lors de la création de l\'agent' });
    }
});

app.get('/api/activities/recent', vérifierToken, async (req, res) => {
    try {
        // Récupérer les dernières activités (tickets, connexions, etc.)
        const recentTickets = await Ticket.find()
            .sort({ date: -1 })
            .limit(20)
            .populate('agent_id', 'name username');
        
        const activities = recentTickets.map(ticket => ({
            type: 'ticket_created',
            user: ticket.agent_name,
            action: `Ticket #${ticket.number} créé`,
            timestamp: ticket.date,
            details: {
                amount: ticket.total,
                draw: ticket.draw,
                draw_time: ticket.draw_time
            }
        }));
        
        res.json({ success: true, activities });
    } catch (error) {
        console.error('Erreur chargement activités:', error);
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des activités' });
    }
});

app.get('/api/reports/generate', vérifierToken, async (req, res) => {
    try {
        const { period } = req.query;
        
        let startDate = new Date();
        let endDate = new Date();
        
        // Définir la période
        switch(period) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                startDate.setDate(startDate.getDate() - 7); // Par défaut: semaine
        }
        
        // Récupérer les tickets dans la période
        const tickets = await Ticket.find({
            date: { $gte: startDate, $lte: endDate }
        });
        
        const totalSales = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
        const ticketCount = tickets.length;
        
        // Récupérer les gagnants dans la période
        const winners = await Winner.find({
            date: { $gte: startDate, $lte: endDate }
        });
        
        const totalPayout = winners.reduce((sum, winner) => sum + winner.total_winnings, 0);
        const profit = totalSales - totalPayout;
        
        const report = {
            period: period,
            start_date: startDate,
            end_date: endDate,
            total_tickets: ticketCount,
            total_sales: totalSales,
            total_payout: totalPayout,
            total_profit: profit,
            profit_margin: totalSales > 0 ? (profit / totalSales * 100).toFixed(2) + '%' : '0%',
            active_agents: await User.countDocuments({ role: 'agent', is_active: true })
        };
        
        res.json({ success: true, report });
    } catch (error) {
        console.error('Erreur génération rapport:', error);
        res.status(500).json({ success: false, error: 'Erreur lors de la génération du rapport' });
    }
});

app.post('/api/system/settings', vérifierToken, async (req, res) => {
    try {
        const settings = req.body;
        
        // Sauvegarder les paramètres dans la base de données
        let config = await Config.findOne();
        if (!config) {
            config = new Config();
        }
        
        if (settings.company_name) config.company_name = settings.company_name;
        if (settings.company_phone) config.company_phone = settings.company_phone;
        if (settings.company_address) config.company_address = settings.company_address;
        if (settings.report_title) config.report_title = settings.report_title;
        if (settings.report_phone) config.report_phone = settings.report_phone;
        if (settings.logo_url) config.logo_url = settings.logo_url;
        
        await config.save();
        
        res.json({ success: true, message: 'Paramètres sauvegardés avec succès' });
    } catch (error) {
        console.error('Erreur sauvegarde paramètres:', error);
        res.status(500).json({ success: false, error: 'Erreur lors de la sauvegarde des paramètres' });
    }
});

// =================== ROUTES POUR LES SOUS-SYSTÈMES ===================

// Routes Master pour les sous-systèmes
app.post('/api/master/subsystems', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const {
      name,
      subdomain,
      contact_email,
      contact_phone,
      max_users,
      subscription_type,
      subscription_months,
      send_credentials
    } = req.body;

    if (!name || !subdomain || !contact_email) {
      return res.status(400).json({
        success: false,
        error: 'Le nom, le sous-domaine et l\'email de contact sont obligatoires'
      });
    }

    const existingSubsystem = await Subsystem.findOne({ subdomain: subdomain.toLowerCase() });
    if (existingSubsystem) {
      return res.status(400).json({
        success: false,
        error: 'Ce sous-domaine est déjà utilisé'
      });
    }

    let adminUser = await User.findOne({ username: contact_email });
    
    if (!adminUser) {
      const generatedPassword = Math.random().toString(36).slice(-8);

      adminUser = new User({
        username: contact_email,
        password: generatedPassword,
        name: name,
        email: contact_email,
        role: 'subsystem',
        level: 1
      });

      await adminUser.save();
    } else {
      if (adminUser.role !== 'subsystem') {
        return res.status(400).json({
          success: false,
          error: 'Cet email est déjà utilisé avec un rôle différent'
        });
      }
    }

    const subscription_expires = new Date();
    subscription_expires.setMonth(subscription_expires.getMonth() + (subscription_months || 1));

    const subsystem = new Subsystem({
      name,
      subdomain: subdomain.toLowerCase(),
      contact_email,
      contact_phone,
      max_users: max_users || 10,
      subscription_type: subscription_type || 'standard',
      subscription_months: subscription_months || 1,
      subscription_expires,
      admin_user: adminUser._id,
      is_active: true,
      stats: {
        active_users: 0,
        today_sales: 0,
        today_tickets: 0,
        usage_percentage: 0
      }
    });

    await subsystem.save();

    adminUser.subsystem_id = subsystem._id;
    await adminUser.save();

    // Obtenir le domaine de base
    let domain = 'novalotto.com';
    if (req.headers.host) {
      const hostParts = req.headers.host.split('.');
      if (hostParts.length > 2) {
        domain = hostParts.slice(1).join('.');
      } else {
        domain = req.headers.host;
      }
    }
    
    // Retirer "master." du domaine si présent
    domain = domain.replace('master.', '');
    
    const access_url = `https://${subdomain.toLowerCase()}.${domain}`;

    res.json({
      success: true,
      subsystem: {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        contact_email: subsystem.contact_email,
        contact_phone: subsystem.contact_phone,
        max_users: subsystem.max_users,
        subscription_type: subsystem.subscription_type,
        subscription_expires: subsystem.subscription_expires,
        is_active: subsystem.is_active,
        created_at: subsystem.created_at
      },
      admin_credentials: {
        username: contact_email,
        password: adminUser.password,
        email: contact_email
      },
      access_url: access_url
    });

  } catch (error) {
    console.error('Erreur création sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création du sous-système: ' + error.message
    });
  }
});

app.get('/api/master/subsystems', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search;
    const status = req.query.status;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { subdomain: { $regex: search, $options: 'i' } },
        { contact_email: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      if (status === 'active') {
        query.is_active = true;
      } else if (status === 'inactive') {
        query.is_active = false;
      } else if (status === 'expired') {
        query.subscription_expires = { $lt: new Date() };
      }
    }

    const total = await Subsystem.countDocuments(query);

    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const subsystems = await Subsystem.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 })
      .populate('admin_user', 'username name email');

    const formattedSubsystems = await Promise.all(subsystems.map(async (subsystem) => {
      // Compter les utilisateurs actifs dans ce sous-système
      const activeUsers = await User.countDocuments({ 
        subsystem_id: subsystem._id,
        is_active: true 
      });
      
      // Calculer les ventes du jour pour ce sous-système
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayTickets = await Ticket.find({ 
        subsystem_id: subsystem._id,
        date: { $gte: today }
      });
      
      const todaySales = todayTickets.reduce((sum, ticket) => sum + ticket.total, 0);
      const todayTicketCount = todayTickets.length;
      
      // Calculer le pourcentage d'utilisation
      const usage_percentage = subsystem.max_users > 0 ? 
        Math.round((activeUsers / subsystem.max_users) * 100) : 0;
      
      return {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        contact_email: subsystem.contact_email,
        contact_phone: subsystem.contact_phone,
        max_users: subsystem.max_users,
        subscription_type: subsystem.subscription_type,
        subscription_expires: subsystem.subscription_expires,
        is_active: subsystem.is_active,
        created_at: subsystem.created_at,
        stats: {
          active_users: activeUsers,
          today_sales: todaySales,
          today_tickets: todayTicketCount,
          usage_percentage: usage_percentage
        },
        users: activeUsers
      };
    }));

    res.json({
      success: true,
      subsystems: formattedSubsystems,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        total_pages: totalPages
      }
    });

  } catch (error) {
    console.error('Erreur listage sous-systèmes:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors du listage des sous-systèmes'
    });
  }
});

app.get('/api/master/subsystems/:id', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const subsystemId = req.params.id;

    const subsystem = await Subsystem.findById(subsystemId).populate('admin_user', 'username name email');

    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Compter les utilisateurs par rôle
    const users = await User.find({ subsystem_id: subsystemId, is_active: true });
    
    const usersByRole = {
      owner: 0,
      admin: 0,
      supervisor: 0,
      agent: 0
    };
    
    users.forEach(user => {
      if (user.role === 'subsystem') usersByRole.owner++;
      else if (user.role === 'supervisor') usersByRole.supervisor++;
      else if (user.role === 'agent') usersByRole.agent++;
    });

    // Calculer les statistiques du jour
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayTickets = await Ticket.find({ 
      subsystem_id: subsystemId,
      date: { $gte: today }
    });
    
    const todaySales = todayTickets.reduce((sum, ticket) => sum + ticket.total, 0);
    const todayTicketCount = todayTickets.length;
    
    // Calculer le pourcentage d'utilisation
    const activeUsers = users.length;
    const usage_percentage = subsystem.max_users > 0 ? 
      Math.round((activeUsers / subsystem.max_users) * 100) : 0;

    res.json({
      success: true,
      subsystem: {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        contact_email: subsystem.contact_email,
        contact_phone: subsystem.contact_phone,
        max_users: subsystem.max_users,
        subscription_type: subsystem.subscription_type,
        subscription_expires: subsystem.subscription_expires,
        is_active: subsystem.is_active,
        created_at: subsystem.created_at,
        stats: {
          active_users: activeUsers,
          today_sales: todaySales,
          today_tickets: todayTicketCount,
          usage_percentage: usage_percentage
        },
        users: users,
        users_by_role: usersByRole
      }
    });

  } catch (error) {
    console.error('Erreur détails sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération du sous-système'
    });
  }
});

app.put('/api/master/subsystems/:id/deactivate', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const subsystemId = req.params.id;

    const subsystem = await Subsystem.findById(subsystemId);

    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    subsystem.is_active = false;
    await subsystem.save();

    // Désactiver également tous les utilisateurs du sous-système
    await User.updateMany(
      { subsystem_id: subsystemId },
      { $set: { is_active: false } }
    );

    res.json({
      success: true,
      message: 'Sous-système désactivé avec succès'
    });

  } catch (error) {
    console.error('Erreur désactivation sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la désactivation du sous-système'
    });
  }
});

app.put('/api/master/subsystems/:id/activate', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const subsystemId = req.params.id;

    const subsystem = await Subsystem.findById(subsystemId);

    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    subsystem.is_active = true;
    await subsystem.save();

    // Réactiver l'administrateur du sous-système
    await User.findByIdAndUpdate(
      subsystem.admin_user,
      { $set: { is_active: true } }
    );

    res.json({
      success: true,
      message: 'Sous-système activé avec succès'
    });

  } catch (error) {
    console.error('Erreur activation sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de l\'activation du sous-système'
    });
  }
});

app.get('/api/master/subsystems/stats', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const subsystems = await Subsystem.find();

    const subsystemsWithStats = await Promise.all(subsystems.map(async (subsystem) => {
      // Calculer les ventes totales pour ce sous-système
      const tickets = await Ticket.find({ subsystem_id: subsystem._id });
      const total_sales = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
      
      // Calculer les paiements (gains)
      const agentIds = await User.find({ 
        subsystem_id: subsystem._id,
        role: 'agent'
      }).select('_id');
      
      const agentIdsArray = agentIds.map(a => a._id);
      const winningTickets = await Winner.find({ agent_id: { $in: agentIdsArray } });
      const total_payout = winningTickets.reduce((sum, winner) => sum + winner.total_winnings, 0);
      
      const profit = total_sales - total_payout;
      const active_agents = await User.countDocuments({ 
        subsystem_id: subsystem._id,
        role: 'agent',
        is_active: true
      });
      
      // Commission master (10% du profit)
      const masterCommission = Math.round(profit * 0.1);

      return {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        total_sales: total_sales,
        total_payout: total_payout,
        profit: profit,
        master_commission: masterCommission,
        active_agents: active_agents,
        profit_rate: total_sales > 0 ? Math.round((profit / total_sales) * 100) : 0
      };
    }));

    res.json({
      success: true,
      subsystems: subsystemsWithStats
    });

  } catch (error) {
    console.error('Erreur statistiques sous-systèmes:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

app.get('/api/master/consolidated-report', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const { start_date, end_date, group_by } = req.query;

    // Convertir les dates
    const startDate = start_date ? new Date(start_date) : new Date();
    const endDate = end_date ? new Date(end_date) : new Date();
    
    if (start_date) startDate.setHours(0, 0, 0, 0);
    if (end_date) endDate.setHours(23, 59, 59, 999);

    // Récupérer tous les tickets dans la période
    const tickets = await Ticket.find({
      date: { $gte: startDate, $lte: endDate }
    }).populate('subsystem_id', 'name subdomain');

    // Récupérer tous les gagnants dans la période
    const winners = await Winner.find({
      date: { $gte: startDate, $lte: endDate }
    });

    // Calculer les totaux
    const total_tickets = tickets.length;
    const total_sales = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    const total_payout = winners.reduce((sum, winner) => sum + winner.total_winnings, 0);
    const total_profit = total_sales - total_payout;

    // Regrouper par sous-système
    const subsystemsMap = new Map();
    
    tickets.forEach(ticket => {
      if (!ticket.subsystem_id) return;
      
      const subsystemId = ticket.subsystem_id._id.toString();
      if (!subsystemsMap.has(subsystemId)) {
        subsystemsMap.set(subsystemId, {
          subsystem_id: subsystemId,
          subsystem_name: ticket.subsystem_id.name,
          tickets_count: 0,
          total_sales: 0,
          total_payout: 0,
          profit: 0
        });
      }
      
      const subsystemData = subsystemsMap.get(subsystemId);
      subsystemData.tickets_count++;
      subsystemData.total_sales += ticket.total;
    });

    // Ajouter les paiements par sous-système
    for (const winner of winners) {
      const ticket = await Ticket.findById(winner.ticket_id).populate('subsystem_id');
      if (!ticket || !ticket.subsystem_id) continue;
      
      const subsystemId = ticket.subsystem_id._id.toString();
      if (subsystemsMap.has(subsystemId)) {
        const subsystemData = subsystemsMap.get(subsystemId);
        subsystemData.total_payout += winner.total_winnings;
        subsystemData.profit = subsystemData.total_sales - subsystemData.total_payout;
      }
    }

    const subsystems_detail = Array.from(subsystemsMap.values());

    // Breakdown quotidien si group_by = 'day'
    let daily_breakdown = [];
    if (group_by === 'day') {
      const dailyMap = new Map();
      
      tickets.forEach(ticket => {
        const dateStr = ticket.date.toISOString().split('T')[0];
        if (!dailyMap.has(dateStr)) {
          dailyMap.set(dateStr, {
            date: dateStr,
            ticket_count: 0,
            total_amount: 0
          });
        }
        
        const dayData = dailyMap.get(dateStr);
        dayData.ticket_count++;
        dayData.total_amount += ticket.total;
      });
      
      daily_breakdown = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    const report = {
      period: {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      },
      summary: {
        total_tickets: total_tickets,
        total_sales: total_sales,
        total_payout: total_payout,
        total_profit: total_profit,
        profit_margin: total_sales > 0 ? Math.round((total_profit / total_sales) * 100) : 0
      },
      subsystems_detail: subsystems_detail,
      daily_breakdown: daily_breakdown
    };

    res.json({
      success: true,
      report: report
    });

  } catch (error) {
    console.error('Erreur génération rapport:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la génération du rapport'
    });
  }
});

// Routes pour les administrateurs de sous-systèmes
app.get('/api/subsystems/mine', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    let subsystems = [];
    
    if (user.role === 'subsystem') {
      subsystems = await Subsystem.find({ 
        admin_user: user._id,
        is_active: true 
      });
    } else if (user.role === 'master') {
      subsystems = await Subsystem.find({ is_active: true });
    } else {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle insuffisant.'
      });
    }

    const formattedSubsystems = subsystems.map(subsystem => ({
      id: subsystem._id,
      name: subsystem.name,
      subdomain: subsystem.subdomain,
      contact_email: subsystem.contact_email,
      contact_phone: subsystem.contact_phone,
      max_users: subsystem.max_users,
      subscription_type: subsystem.subscription_type,
      subscription_expires: subsystem.subscription_expires,
      is_active: subsystem.is_active,
      created_at: subsystem.created_at
    }));

    res.json({
      success: true,
      subsystems: formattedSubsystems
    });

  } catch (error) {
    console.error('Erreur récupération sous-systèmes:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des sous-systèmes'
    });
  }
});

// Route pour vérifier la session
app.get('/api/auth/check', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Session invalide'
      });
    }
    
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
    
    res.json({
      success: true,
      admin: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email
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

// =================== ROUTES POUR INITIALISER LA BASE DE DONNÉES ===================

app.post('/api/init/master', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    
    const existingMaster = await User.findOne({ role: 'master' });
    if (existingMaster) {
      return res.status(400).json({
        success: false,
        error: 'Un compte master existe déjà'
      });
    }
    
    const master = new User({
      username: username,
      password: password,
      name: name || 'Master Admin',
      role: 'master',
      level: 1
    });
    
    await master.save();
    
    res.json({
      success: true,
      message: 'Compte master créé avec succès'
    });
  } catch (error) {
    console.error('Erreur création compte master:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du compte master'
    });
  }
});

app.post('/api/init/subsystem', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    
    const existingUser = await User.findOne({ username: username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Cet utilisateur existe déjà'
      });
    }
    
    const subsystemUser = new User({
      username: username,
      password: password,
      name: name || 'Subsystem Admin',
      role: 'subsystem',
      level: 1
    });
    
    await subsystemUser.save();
    
    res.json({
      success: true,
      message: 'Compte subsystem créé avec succès'
    });
  } catch (error) {
    console.error('Erreur création compte subsystem:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du compte subsystem'
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

app.get('/subsystem-admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

app.get('/control-level1.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/supervisor-control.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor-control.html'));
});

app.get('/master-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

// =================== MIDDLEWARE DE GESTION D'ERREURS ===================

app.use((err, req, res, next) => {
  if (err) {
    console.error('Erreur serveur:', err);
    
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur interne'
      });
    }
    
    return res.status(500).send('Erreur serveur interne');
  }
  next();
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'Route API non trouvée'
    });
  }
  
  res.status(404).send('Page non trouvée');
});

// =================== DÉMARRAGE DU SERVEUR ===================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📁 Compression GZIP activée`);
  console.log(`🌐 CORS activé`);
  console.log(`👑 Master Dashboard: http://localhost:${PORT}/master-dashboard.html`);
  console.log(`🏢 Subsystem Admin: http://localhost:${PORT}/subsystem-admin.html`);
  console.log(`🎰 LOTATO: http://localhost:${PORT}/lotato.html`);
  console.log(`👮 Control Level 1: http://localhost:${PORT}/control-level1.html`);
  console.log(`👮 Control Level 2: http://localhost:${PORT}/control-level2.html`);
  console.log(`📊 Supervisor Control: http://localhost:${PORT}/supervisor-control.html`);
  console.log(`🏠 Login: http://localhost:${PORT}/`);
  console.log('');
  console.log('✅ Serveur prêt avec toutes les routes !');
  console.log('');
  console.log('📋 Routes API LOTATO disponibles:');
  console.log('  POST   /api/history                     - Enregistrer historique');
  console.log('  GET    /api/history                     - Récupérer historique');
  console.log('  GET    /api/tickets                     - Récupérer tickets de l\'agent');
  console.log('  POST   /api/tickets                     - Sauvegarder ticket');
  console.log('  GET    /api/tickets/pending             - Tickets en attente');
  console.log('  POST   /api/tickets/pending             - Sauvegarder ticket en attente');
  console.log('  GET    /api/tickets/winning             - Tickets gagnants');
  console.log('  GET    /api/tickets/multi-draw          - Fiches multi-tirages');
  console.log('  POST   /api/tickets/multi-draw          - Sauvegarder fiche multi-tirages');
  console.log('  GET    /api/company-info                - Informations entreprise');
  console.log('  GET    /api/logo                        - URL du logo');
  console.log('  GET    /api/results                     - Récupérer résultats');
  console.log('  POST   /api/check-winners               - Vérifier gagnants');
  console.log('  GET    /api/auth/check                  - Vérifier session');
  console.log('');
  console.log('📋 Routes API SOUS-SYSTÈMES (Admin) disponibles:');
  console.log('  POST   /api/subsystem/users/create      - Créer utilisateur');
  console.log('  GET    /api/subsystem/users             - Lister utilisateurs');
  console.log('  PUT    /api/subsystem/users/:id/status  - Activer/désactiver utilisateur');
  console.log('  PUT    /api/subsystem/users/:id         - Modifier utilisateur');
  console.log('  POST   /api/subsystem/assign            - Assigner superviseur');
  console.log('  GET    /api/subsystem/stats             - Statistiques sous-système');
  console.log('  GET    /api/subsystem/activities        - Activités récentes');
  console.log('  GET    /api/subsystem/tickets           - Tickets du sous-système');
  console.log('');
  console.log('📋 Routes API MASTER DASHBOARD disponibles:');
  console.log('  POST   /api/master/init                 - Initialiser compte master');
  console.log('  POST   /api/master/login                - Connexion master');
  console.log('  GET    /api/master/check-session        - Vérifier session master');
  console.log('  POST   /api/master/subsystems           - Créer sous-système');
  console.log('  GET    /api/master/subsystems           - Lister sous-systèmes');
  console.log('  GET    /api/master/subsystems/:id       - Détails sous-système');
  console.log('  PUT    /api/master/subsystems/:id/deactivate - Désactiver sous-système');
  console.log('  PUT    /api/master/subsystems/:id/activate   - Activer sous-système');
  console.log('  GET    /api/master/subsystems/stats     - Statistiques sous-systèmes');
  console.log('  GET    /api/master/consolidated-report  - Rapport consolidé');
  console.log('');
  console.log('📋 Routes API générales:');
  console.log('  POST   /api/auth/login                  - Connexion générale');
  console.log('  GET    /api/health                      - Santé du serveur');
  console.log('  GET    /api/statistics                  - Statistiques globales');
  console.log('  GET    /api/agents                      - Liste agents');
  console.log('  GET    /api/supervisors                 - Liste superviseurs');
  console.log('  POST   /api/agents/create               - Créer agent');
  console.log('  GET    /api/activities/recent           - Activités récentes');
  console.log('  GET    /api/reports/generate            - Générer rapport');
  console.log('  POST   /api/system/settings             - Sauvegarder paramètres');
  console.log('');
  console.log('⚠️  IMPORTANT: Assurez-vous d\'avoir un compte master dans la base de données:');
  console.log('   - username: master');
  console.log('   - password: master123');
  console.log('   - role: master');
});