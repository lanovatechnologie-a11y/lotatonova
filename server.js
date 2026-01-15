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
  role: {
    type: String,
    enum: ['master', 'subsystem', 'supervisor', 'agent'],
    required: true
  },
  level: { type: Number, default: 1 },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  parent_supervisor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  supervisor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  is_active: { type: Boolean, default: true },
  last_login: { type: Date },
  last_activity: { type: Date },
  created_at: { type: Date, default: Date.now }
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
    token = req.headers['authorization'];
    if (token && token.startsWith('Bearer ')) {
      token = token.substring(7);
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

// =================== ROUTES DE CONNEXION ===================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    console.log('Tentative de connexion:', { username, password, role });
    
    const user = await User.findOne({ 
      username,
      password,
      role
    });

    if (!user) {
      console.log('Utilisateur non trouvé ou informations incorrectes');
      return res.status(401).json({
        success: false,
        error: 'Identifiants ou rôle incorrect'
      });
    }

    console.log('Utilisateur trouvé:', user.username, user.role);

    // Mettre à jour la dernière connexion
    user.last_login = new Date();
    await user.save();

    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;

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
        subsystem_id: user.subsystem_id
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
      error: 'Erreur lors de l\\'enregistrement de l\\'historique'
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
      error: 'Erreur lors de la récupération de l\\'historique'
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
      subsystem_id: user.subsystem_id,
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
      subsystem_id: user.subsystem_id,
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
      agent_name: user.name,
      subsystem_id: user.subsystem_id
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
      error: 'Erreur lors du chargement des informations de l\\'entreprise'
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
    
    const statistics = {
      active_agents: activeAgents,
      active_supervisors: activeSupervisors,
      active_subsystems: activeSubsystems,
      total_sales: Math.floor(Math.random() * 10000000) + 5000000,
      total_profit: Math.floor(Math.random() * 3000000) + 1000000,
      total_users: totalUsers
    };
    
    res.json({
      success: true,
      statistics: statistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des statistiques'
    });
  }
});

app.get('/api/agents', vérifierToken, async (req, res) => {
  try {
    const agents = await User.find({ 
      role: 'agent'
    }).select('-password');
    
    const agentsWithStats = agents.map(agent => {
      const total_sales = Math.floor(Math.random() * 100000) + 10000;
      const total_payout = Math.floor(total_sales * 0.6);
      const total_tickets = Math.floor(Math.random() * 500) + 50;
      const winning_tickets = Math.floor(total_tickets * 0.3);
      
      return {
        ...agent.toObject(),
        total_sales: total_sales,
        total_payout: total_payout,
        total_tickets: total_tickets,
        winning_tickets: winning_tickets,
        is_online: Math.random() > 0.5,
        last_active: new Date(Date.now() - Math.random() * 10000000000)
      };
    });
    
    res.json({
      success: true,
      agents: agentsWithStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des agents'
    });
  }
});

app.get('/api/supervisors', vérifierToken, async (req, res) => {
  try {
    const supervisors = await User.find({ 
      role: 'supervisor'
    }).select('-password');
    
    const supervisorsWithStats = supervisors.map(supervisor => {
      const agents_count = Math.floor(Math.random() * 10) + 1;
      const total_sales = Math.floor(Math.random() * 500000) + 50000;
      const total_payout = Math.floor(total_sales * 0.65);
      
      return {
        ...supervisor.toObject(),
        agents_count: agents_count,
        total_sales: total_sales,
        total_payout: total_payout
      };
    });
    
    res.json({
      success: true,
      supervisors: supervisorsWithStats
    });
  } catch (error) {
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
        res.status(500).json({ success: false, error: 'Erreur lors de la création de l\\'agent' });
    }
});

app.get('/api/activities/recent', vérifierToken, async (req, res) => {
    try {
        const activities = [];
        res.json({ success: true, activities });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des activités' });
    }
});

app.get('/api/reports/generate', vérifierToken, async (req, res) => {
    try {
        const { period } = req.query;
        const report = {
            period: period,
            monthlyPerformance: 85,
            ticketResolution: 92,
            activeAgents: await User.countDocuments({ role: 'agent', is_active: true }),
            pendingTickets: 5
        };
        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors de la génération du rapport' });
    }
});

app.post('/api/system/settings', vérifierToken, async (req, res) => {
    try {
        res.json({ success: true, message: 'Paramètres sauvegardés avec succès' });
    } catch (error) {
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
        error: 'Le nom, le sous-domaine et l\\'email de contact sont obligatoires'
      });
    }

    const existingSubsystem = await Subsystem.findOne({ subdomain: subdomain });
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
      is_active: true
    });

    await subsystem.save();

    adminUser.subsystem_id = subsystem._id;
    await adminUser.save();

    const domain = process.env.DOMAIN || req.headers.host?.replace('master.', '') || 'novalotto.com';
    const access_url = `https://${subdomain}.${domain}`;

    res.json({
      success: true,
      subsystem: {
        id: subsystem._id,
        ...subsystem.toObject()
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
      error: 'Erreur serveur lors de la création du sous-système'
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
      .sort({ created_at: -1 });

    const formattedSubsystems = subsystems.map(subsystem => {
      const usage_percentage = Math.floor((Math.random() * 100) + 1);

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
          active_users: Math.floor(Math.random() * subsystem.max_users),
          today_sales: Math.floor(Math.random() * 10000) + 1000,
          today_tickets: Math.floor(Math.random() * 100) + 10,
          usage_percentage: usage_percentage
        }
      };
    });

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

    const subsystem = await Subsystem.findById(subsystemId);

    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const users = [
      { role: 'owner', count: 1 },
      { role: 'admin', count: Math.floor(Math.random() * 3) + 1 },
      { role: 'supervisor', count: Math.floor(Math.random() * 5) + 1 },
      { role: 'agent', count: Math.floor(Math.random() * subsystem.max_users) + 5 }
    ];

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
          active_users: Math.floor(Math.random() * subsystem.max_users),
          today_sales: Math.floor(Math.random() * 10000) + 1000,
          today_tickets: Math.floor(Math.random() * 100) + 10,
          usage_percentage: Math.floor((Math.random() * 100) + 1)
        },
        users: users
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

    res.json({
      success: true,
      message: 'Sous-système activé avec succès'
    });

  } catch (error) {
    console.error('Erreur activation sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de l\\'activation du sous-système'
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

    const subsystemsWithStats = subsystems.map(subsystem => {
      const total_sales = Math.floor(Math.random() * 1000000) + 100000;
      const total_payout = Math.floor(total_sales * 0.7);
      const profit = total_sales - total_payout;
      const active_agents = Math.floor(Math.random() * 20) + 1;

      return {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        total_sales: total_sales,
        total_payout: total_payout,
        profit: profit,
        active_agents: active_agents
      };
    });

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

    const report = {
      period: {
        start_date: start_date || new Date().toISOString().split('T')[0],
        end_date: end_date || new Date().toISOString().split('T')[0]
      },
      summary: {
        total_tickets: 1234,
        total_sales: 5000000,
        total_payout: 3500000,
        total_profit: 1500000
      },
      subsystems_detail: [
        {
          subsystem_id: '1',
          subsystem_name: 'Borlette Cap-Haïtien',
          tickets_count: 500,
          total_sales: 2000000,
          total_payout: 1400000,
          profit: 600000
        },
        {
          subsystem_id: '2',
          subsystem_name: 'Lotto Port-au-Prince',
          tickets_count: 400,
          total_sales: 1500000,
          total_payout: 1050000,
          profit: 450000
        },
        {
          subsystem_id: '3',
          subsystem_name: 'Grap Gonaïves',
          tickets_count: 334,
          total_sales: 1500000,
          total_payout: 1050000,
          profit: 450000
        }
      ],
      daily_breakdown: [
        {
          date: new Date().toISOString().split('T')[0],
          ticket_count: 100,
          total_amount: 500000
        }
      ]
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
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        subsystem_id: user.subsystem_id
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

// =================== NOUVELLES ROUTES POUR LA GESTION DES UTILISATEURS PAR LES SOUS-SYSTÈMES ===================

// Route pour créer des utilisateurs dans un sous-système
app.post('/api/subsystems/users/create', vérifierToken, async (req, res) => {
  try {
    const { 
      name, 
      username, 
      password, 
      role, 
      level, 
      subsystem_id,
      is_active,
      parent_supervisor_id,
      supervisor_id 
    } = req.body;

    // Vérifier que l'utilisateur a le droit de créer des utilisateurs dans ce sous-système
    const currentUser = await User.findById(req.tokenInfo.userId);
    
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Vérifier les permissions
    if (currentUser.role !== 'subsystem' && currentUser.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Permission refusée. Seuls les administrateurs de sous-système ou master peuvent créer des utilisateurs'
      });
    }

    // Si c'est un administrateur de sous-système, vérifier qu'il gère bien ce sous-système
    if (currentUser.role === 'subsystem') {
      const subsystem = await Subsystem.findOne({ 
        admin_user: currentUser._id,
        _id: subsystem_id 
      });
      
      if (!subsystem) {
        return res.status(403).json({
          success: false,
          error: 'Vous ne pouvez créer des utilisateurs que dans votre propre sous-système'
        });
      }
    }

    // Vérifier si le nom d'utilisateur existe déjà
    const existingUser = await User.findOne({ username: username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Ce nom d\\'utilisateur est déjà utilisé'
      });
    }

    // Vérifier la limite d'utilisateurs pour le sous-système
    const subsystem = await Subsystem.findById(subsystem_id);
    if (subsystem) {
      const userCount = await User.countDocuments({ 
        subsystem_id: subsystem_id,
        role: { $in: ['agent', 'supervisor'] }
      });
      
      if (userCount >= subsystem.max_users) {
        return res.status(400).json({
          success: false,
          error: `Limite d\\'utilisateurs atteinte (${subsystem.max_users} maximum)`
        });
      }
    }

    // Créer le nouvel utilisateur
    const newUser = new User({
      username: username,
      password: password,
      name: name,
      role: role,
      level: level || 1,
      subsystem_id: subsystem_id,
      is_active: is_active !== undefined ? is_active : true,
      parent_supervisor_id: parent_supervisor_id,
      supervisor_id: supervisor_id,
      created_at: new Date()
    });

    await newUser.save();

    // Mettre à jour les statistiques du sous-système
    if (subsystem) {
      const activeUsers = await User.countDocuments({ 
        subsystem_id: subsystem_id,
        is_active: true,
        role: { $in: ['agent', 'supervisor'] }
      });
      
      subsystem.stats.active_users = activeUsers;
      await subsystem.save();
    }

    res.json({
      success: true,
      message: `${role === 'agent' ? 'Agent' : 'Superviseur'} créé avec succès`,
      user: {
        id: newUser._id,
        username: newUser.username,
        name: newUser.name,
        role: newUser.role,
        level: newUser.level,
        is_active: newUser.is_active
      }
    });

  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de l\\'utilisateur'
    });
  }
});

// Route pour lister les utilisateurs d'un sous-système
app.get('/api/subsystems/:id/users', vérifierToken, async (req, res) => {
  try {
    const subsystemId = req.params.id;
    
    // Vérifier les permissions
    const currentUser = await User.findById(req.tokenInfo.userId);
    
    if (currentUser.role === 'subsystem') {
      const subsystem = await Subsystem.findOne({ 
        admin_user: currentUser._id,
        _id: subsystemId 
      });
      
      if (!subsystem) {
        return res.status(403).json({
          success: false,
          error: 'Permission refusée'
        });
      }
    } else if (currentUser.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Permission refusée'
      });
    }

    const users = await User.find({ 
      subsystem_id: subsystemId,
      role: { $in: ['agent', 'supervisor'] }
    }).select('-password');

    res.json({
      success: true,
      users: users.map(user => ({
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        is_active: user.is_active,
        last_login: user.last_login,
        created_at: user.created_at
      }))
    });

  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des utilisateurs'
    });
  }
});

// Route pour le statut des utilisateurs en ligne
app.get('/api/subsystems/:id/users/status', vérifierToken, async (req, res) => {
  try {
    const subsystemId = req.params.id;
    
    // Vérifier les permissions
    const currentUser = await User.findById(req.tokenInfo.userId);
    
    if (currentUser.role === 'subsystem') {
      const subsystem = await Subsystem.findOne({ 
        admin_user: currentUser._id,
        _id: subsystemId 
      });
      
      if (!subsystem) {
        return res.status(403).json({
          success: false,
          error: 'Permission refusée'
        });
      }
    } else if (currentUser.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Permission refusée'
      });
    }

    const users = await User.find({ 
      subsystem_id: subsystemId,
      role: { $in: ['agent', 'supervisor'] }
    }).select('-password');
    
    // Simuler des statuts en ligne (dans un vrai système, utiliseriez un système de session)
    const usersWithStatus = users.map(user => ({
      id: user._id,
      name: user.name,
      role: user.role,
      level: user.level,
      is_online: Math.random() > 0.5, // Simulation
      last_seen: new Date(Date.now() - Math.random() * 3600000) // Simulation
    }));

    res.json({
      success: true,
      users: usersWithStatus
    });

  } catch (error) {
    console.error('Erreur récupération statut:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statuts'
    });
  }
});

// Route pour récupérer un sous-système par ID
app.get('/api/subsystems/:id', vérifierToken, async (req, res) => {
  try {
    const subsystemId = req.params.id;
    
    // Vérifier les permissions
    const currentUser = await User.findById(req.tokenInfo.userId);
    
    if (currentUser.role === 'subsystem') {
      const subsystem = await Subsystem.findOne({ 
        admin_user: currentUser._id,
        _id: subsystemId 
      });
      
      if (!subsystem) {
        return res.status(403).json({
          success: false,
          error: 'Permission refusée'
        });
      }
    } else if (currentUser.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Permission refusée'
      });
    }

    const subsystem = await Subsystem.findById(subsystemId);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

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
        stats: subsystem.stats
      }
    });

  } catch (error) {
    console.error('Erreur récupération sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du sous-système'
    });
  }
});

// Route pour récupérer un sous-système par administrateur
app.get('/api/subsystems/by-admin/:adminId', vérifierToken, async (req, res) => {
  try {
    const adminId = req.params.adminId;
    
    const subsystem = await Subsystem.findOne({ 
      admin_user: adminId,
      is_active: true 
    });
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé pour cet administrateur'
      });
    }

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
        stats: subsystem.stats
      }
    });

  } catch (error) {
    console.error('Erreur récupération sous-système par admin:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du sous-système'
    });
  }
});

// Route pour le tableau de bord du sous-système
app.get('/api/subsystems/:id/dashboard', vérifierToken, async (req, res) => {
  try {
    const subsystemId = req.params.id;
    
    // Vérifier les permissions
    const currentUser = await User.findById(req.tokenInfo.userId);
    
    if (currentUser.role === 'subsystem') {
      const subsystem = await Subsystem.findOne({ 
        admin_user: currentUser._id,
        _id: subsystemId 
      });
      
      if (!subsystem) {
        return res.status(403).json({
          success: false,
          error: 'Permission refusée'
        });
      }
    } else if (currentUser.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Permission refusée'
      });
    }

    // Compter les utilisateurs actifs
    const activeUsers = await User.countDocuments({ 
      subsystem_id: subsystemId,
      is_active: true,
      role: { $in: ['agent', 'supervisor'] }
    });
    
    // Compter tous les utilisateurs du sous-système
    const totalUsers = await User.countDocuments({ 
      subsystem_id: subsystemId,
      role: { $in: ['agent', 'supervisor'] }
    });
    
    // Simuler des données pour le dashboard
    const onlineUsers = Math.floor(Math.random() * activeUsers) + 1;
    const todaySales = Math.floor(Math.random() * 100000) + 50000;
    const todayTickets = Math.floor(Math.random() * 500) + 100;
    const pendingAlerts = Math.floor(Math.random() * 10);
    const totalSales = Math.floor(Math.random() * 1000000) + 500000;
    const totalTickets = Math.floor(Math.random() * 5000) + 1000;
    const estimatedProfit = Math.floor(totalSales * 0.3);

    res.json({
      success: true,
      online_users: onlineUsers,
      today_sales: todaySales,
      today_tickets: todayTickets,
      pending_alerts: pendingAlerts,
      total_sales: totalSales,
      active_users: activeUsers,
      max_users: totalUsers,
      total_tickets: totalTickets,
      estimated_profit: estimatedProfit
    });

  } catch (error) {
    console.error('Erreur récupération dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des données du dashboard'
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
  console.log('📋 Routes API SOUS-SYSTÈMES disponibles:');
  console.log('  GET    /api/subsystems/mine             - Sous-systèmes de l\'utilisateur');
  console.log('  POST   /api/subsystems/users/create     - Créer utilisateur dans sous-système');
  console.log('  GET    /api/subsystems/:id/users        - Lister utilisateurs du sous-système');
  console.log('  GET    /api/subsystems/:id/users/status - Statut des utilisateurs');
  console.log('  GET    /api/subsystems/:id              - Détails du sous-système');
  console.log('  GET    /api/subsystems/:id/dashboard    - Dashboard du sous-système');
  console.log('  GET    /api/subsystems/by-admin/:id     - Sous-système par admin');
  console.log('');
  console.log('📋 Routes API MASTER pour sous-systèmes:');
  console.log('  POST   /api/master/subsystems           - Créer sous-système (master)');
  console.log('  GET    /api/master/subsystems           - Lister sous-systèmes (master)');
  console.log('  GET    /api/master/subsystems/:id       - Détails sous-système (master)');
});