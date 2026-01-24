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
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware standard
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
const MONGODB_URI = process.env.MONGO_URL || 'mongodb://localhost:27017/lottodb';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
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
  password: { type: String, required: true }, // MOT DE PASSE EN CLAIR
  name: { type: String, required: true },
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
  created_at: { type: Date, default: Date.now },
  last_login: { type: Date }
});

const User = mongoose.model('User', userSchema);

// Schema sous-système
const subsystemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subdomain: { type: String, required: true, unique: true },
  contact_email: { type: String, required: true },
  contact_phone: { type: String },
  company_name: { type: String, default: 'Nova Lotto' },
  company_phone: { type: String, default: '+509 32 53 49 58' },
  company_address: { type: String, default: 'Cap Haïtien' },
  report_title: { type: String, default: 'Nova Lotto' },
  report_phone: { type: String, default: '40104585' },
  logo: { type: String, default: 'logo-borlette.jpg' },
  multipliers: {
    lotto3: { type: Number, default: 500 },
    grap: { type: Number, default: 500 },
    marriage: { type: Number, default: 1000 },
    borlette: { 
      main: { type: Number, default: 60 },
      secondary: { type: Number, default: 20 },
      tertiary: { type: Number, default: 10 }
    },
    boulpe: { 
      main: { type: Number, default: 60 },
      secondary: { type: Number, default: 20 },
      tertiary: { type: Number, default: 10 }
    },
    lotto4: { type: Number, default: 5000 },
    lotto5: { type: Number, default: 25000 },
    'auto-marriage': { type: Number, default: 1000 },
    'auto-lotto4': { type: Number, default: 5000 }
  },
  supervisor: { type: String, default: 'Superviseur Nova' },
  created_by: { type: String, default: 'Système Master' },
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
    total_tickets: { type: Number, default: 0 },
    total_sales: { type: Number, default: 0 },
    usage_percentage: { type: Number, default: 0 }
  }
});

const Subsystem = mongoose.model('Subsystem', subsystemSchema);

// Schema ticket
const ticketSchema = new mongoose.Schema({
  ticket_number: { type: Number, required: true },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem', required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  agent_name: { type: String, required: true },
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  bets: [{
    type: { type: String, required: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    options: {
      option1: Boolean,
      option2: Boolean,
      option3: Boolean
    },
    perOptionAmount: Number,
    isLotto4: Boolean,
    isLotto5: Boolean,
    isAuto: Boolean,
    isGroup: Boolean,
    details: Array
  }],
  total_amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'cancelled', 'won', 'lost'], 
    default: 'confirmed' 
  },
  winning_amount: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  printed_at: Date
});

const Ticket = mongoose.model('Ticket', ticketSchema);

// Schema ticket multi-tirages
const multiDrawTicketSchema = new mongoose.Schema({
  ticket_number: { type: Number, required: true },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem', required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  agent_name: { type: String, required: true },
  draws: [{ type: String, required: true }],
  bets: [{
    gameType: { type: String, required: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    draws: [{ type: String }]
  }],
  total_amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'cancelled'], 
    default: 'confirmed' 
  },
  created_at: { type: Date, default: Date.now }
});

const MultiDrawTicket = mongoose.model('MultiDrawTicket', multiDrawTicketSchema);

// Schema résultats
const resultSchema = new mongoose.Schema({
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  date: { type: Date, required: true },
  lot1: { type: String, required: true },
  lot2: { type: String, required: true },
  lot3: { type: String, required: true },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  created_at: { type: Date, default: Date.now }
});

const Result = mongoose.model('Result', resultSchema);

// Schema historique
const historySchema = new mongoose.Schema({
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem', required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now }
});

const History = mongoose.model('History', historySchema);

// =================== MIDDLEWARE TOKEN NOVA ===================

// Middleware pour vérifier le token Nova (format: nova_timestamp_userid_role_level)
function verifyNovaToken(req, res, next) {
  let token = req.headers['authorization'];
  
  // Extraire le token du header Bearer
  if (token && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }
  
  // Vérifier si le token est présent dans les query params (pour redirection)
  if (!token && req.query.token) {
    token = req.query.token;
  }
  
  if (!token || !token.startsWith('nova_')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Token manquant ou invalide' 
    });
  }
  
  try {
    // Décoder le token Nova (format: nova_timestamp_userid_role_level)
    const parts = token.split('_');
    
    if (parts.length < 5) {
      return res.status(401).json({ 
        success: false, 
        error: 'Format de token invalide' 
      });
    }
    
    const timestamp = parseInt(parts[1]);
    const userId = parts[2];
    const role = parts[3];
    const level = parts[4];
    
    // Vérifier si le token est expiré (24h)
    const now = Date.now();
    const tokenAge = now - timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24h en millisecondes
    
    if (tokenAge > maxAge) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token expiré' 
      });
    }
    
    // Stocker les infos du token dans req
    req.tokenInfo = {
      token: token,
      userId: userId,
      role: role,
      level: level,
      timestamp: timestamp
    };
    
    next();
  } catch (error) {
    console.error('Erreur vérification token:', error);
    return res.status(401).json({ 
      success: false, 
      error: 'Token invalide' 
    });
  }
}

// =================== ROUTES AUTHENTIFICATION ===================

// Route de connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    console.log('Tentative de connexion:', { username, role });
    
    // Recherche de l'utilisateur
    const user = await User.findOne({ 
      username: username,
      is_active: true
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants incorrects'
      });
    }
    
    // Vérifier le mot de passe EN CLAIR
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants incorrects'
      });
    }
    
    // Vérifier le rôle si spécifié
    if (role && user.role !== role) {
      // Gestion spéciale pour superviseur1/supervisor2
      if (role === 'supervisor1' && user.role === 'supervisor' && user.level === 1) {
        // OK
      } else if (role === 'supervisor2' && user.role === 'supervisor' && user.level === 2) {
        // OK
      } else {
        return res.status(403).json({
          success: false,
          error: 'Rôle incorrect pour cette connexion'
        });
      }
    }
    
    // Mettre à jour la dernière connexion
    user.last_login = new Date();
    await user.save();
    
    // Générer le token au format nova_timestamp_userid_role_level
    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;
    
    // Déterminer l'URL de redirection
    let redirectUrl = '/';
    switch(user.role) {
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
    }
    
    redirectUrl += `?token=${encodeURIComponent(token)}`;
    
    // Préparer la réponse
    const response = {
      success: true,
      token: token,
      redirectUrl: redirectUrl,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email,
        subsystem_id: user.subsystem_id
      }
    };
    
    // Pour les agents, ajouter les informations du sous-système
    if (user.role === 'agent' && user.subsystem_id) {
      const subsystem = await Subsystem.findById(user.subsystem_id);
      if (subsystem) {
        response.subsystem = {
          name: subsystem.name,
          logo: subsystem.logo,
          company_name: subsystem.company_name,
          company_phone: subsystem.company_phone,
          company_address: subsystem.company_address,
          multipliers: subsystem.multipliers,
          supervisor: subsystem.supervisor,
          created_by: subsystem.created_by
        };
      }
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la connexion'
    });
  }
});

// Vérifier l'authentification (utilisé par lotato.js)
app.get('/api/auth/check', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
    
    // Vérifier si l'utilisateur est actif
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Compte désactivé'
      });
    }
    
    const response = {
      success: true,
      admin: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email,
        subsystem_id: user.subsystem_id
      }
    };
    
    // Pour les agents, ajouter les informations du sous-système
    if (user.role === 'agent' && user.subsystem_id) {
      const subsystem = await Subsystem.findById(user.subsystem_id);
      if (subsystem) {
        response.subsystem = {
          name: subsystem.name,
          logo: subsystem.logo,
          company_name: subsystem.company_name,
          company_phone: subsystem.company_phone,
          company_address: subsystem.company_address,
          multipliers: subsystem.multipliers,
          supervisor: subsystem.supervisor,
          created_by: subsystem.created_by
        };
      }
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('Erreur vérification auth:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Vérifier un token (pour auto-login)
app.post('/api/auth/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token || !token.startsWith('nova_')) {
      return res.json({
        success: false,
        valid: false
      });
    }
    
    // Décoder le token
    const parts = token.split('_');
    if (parts.length < 5) {
      return res.json({
        success: false,
        valid: false
      });
    }
    
    const userId = parts[2];
    const user = await User.findById(userId);
    
    if (!user || !user.is_active) {
      return res.json({
        success: false,
        valid: false
      });
    }
    
    // Déterminer l'URL de redirection
    let redirectUrl = '/';
    switch(user.role) {
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
    }
    
    res.json({
      success: true,
      valid: true,
      redirectUrl: redirectUrl,
      user: {
        id: user._id,
        role: user.role,
        level: user.level
      }
    });
    
  } catch (error) {
    console.error('Erreur vérification token:', error);
    res.json({
      success: false,
      valid: false
    });
  }
});

// =================== ROUTES SOUS-SYSTÈME ===================

// Informations du sous-système
app.get('/api/subsystem/info', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user || !user.subsystem_id) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }
    
    const subsystem = await Subsystem.findById(user.subsystem_id);
    
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
        logo: subsystem.logo,
        company_name: subsystem.company_name,
        company_phone: subsystem.company_phone,
        company_address: subsystem.company_address,
        multipliers: subsystem.multipliers,
        supervisor: subsystem.supervisor,
        created_by: subsystem.created_by
      }
    });
    
  } catch (error) {
    console.error('Erreur récupération sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Informations de l'entreprise
app.get('/api/company-info', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    // Valeurs par défaut
    let companyInfo = {
      company_name: "Nova Lotto",
      company_phone: "+509 32 53 49 58",
      company_address: "Cap Haïtien",
      report_title: "Nova Lotto",
      report_phone: "40104585"
    };
    
    // Si l'utilisateur a un sous-système, utiliser ses infos
    if (user && user.subsystem_id) {
      const subsystem = await Subsystem.findById(user.subsystem_id);
      
      if (subsystem) {
        companyInfo = {
          company_name: subsystem.company_name,
          company_phone: subsystem.company_phone,
          company_address: subsystem.company_address,
          report_title: subsystem.report_title || subsystem.company_name,
          report_phone: subsystem.report_phone
        };
      }
    }
    
    res.json({
      success: true,
      ...companyInfo
    });
    
  } catch (error) {
    console.error('Erreur récupération infos entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Logo
app.get('/api/logo', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    let logoUrl = 'logo-borlette.jpg';
    
    if (user && user.subsystem_id) {
      const subsystem = await Subsystem.findById(user.subsystem_id);
      if (subsystem && subsystem.logo) {
        logoUrl = subsystem.logo;
      }
    }
    
    res.json({
      success: true,
      logoUrl: logoUrl
    });
    
  } catch (error) {
    console.error('Erreur récupération logo:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// =================== ROUTES TICKETS ===================

// Créer un ticket
app.post('/api/tickets', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user || user.role !== 'agent') {
      return res.status(403).json({
        success: false,
        error: 'Seuls les agents peuvent créer des tickets'
      });
    }
    
    const { draw, drawTime, bets, total } = req.body;
    
    // Trouver le prochain numéro de ticket
    const lastTicket = await Ticket.findOne({ 
      subsystem_id: user.subsystem_id 
    }).sort({ ticket_number: -1 });
    
    const nextTicketNumber = lastTicket ? lastTicket.ticket_number + 1 : 1;
    
    // Créer le ticket
    const ticket = new Ticket({
      ticket_number: nextTicketNumber,
      subsystem_id: user.subsystem_id,
      agent_id: user._id,
      agent_name: user.name,
      draw: draw,
      draw_time: drawTime,
      bets: bets,
      total_amount: total,
      status: 'confirmed',
      created_at: new Date()
    });
    
    await ticket.save();
    
    // Mettre à jour les statistiques du sous-système
    if (user.subsystem_id) {
      const subsystem = await Subsystem.findById(user.subsystem_id);
      if (subsystem) {
        subsystem.stats.total_tickets += 1;
        subsystem.stats.total_sales += total;
        subsystem.stats.active_users = await User.countDocuments({ 
          subsystem_id: user.subsystem_id,
          is_active: true,
          role: 'agent'
        });
        await subsystem.save();
      }
    }
    
    // Enregistrer dans l'historique
    const history = new History({
      subsystem_id: user.subsystem_id,
      agent_id: user._id,
      action: 'ticket_created',
      details: {
        ticket_number: nextTicketNumber,
        draw: draw,
        draw_time: drawTime,
        total_amount: total,
        bets_count: bets.length
      }
    });
    await history.save();
    
    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        number: ticket.ticket_number,
        date: ticket.created_at,
        draw: ticket.draw,
        drawTime: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total_amount,
        agentName: ticket.agent_name,
        agentId: ticket.agent_id,
        subsystemId: ticket.subsystem_id
      },
      nextTicketNumber: nextTicketNumber + 1
    });
    
  } catch (error) {
    console.error('Erreur création ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création du ticket'
    });
  }
});

// Lister les tickets
app.get('/api/tickets', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    let query = {};
    
    // Pour les agents, voir seulement leurs tickets
    if (user.role === 'agent') {
      query.agent_id = user._id;
    }
    
    // Pour les superviseurs et administrateurs, voir tous les tickets du sous-système
    if (user.subsystem_id && (user.role === 'supervisor' || user.role === 'subsystem')) {
      query.subsystem_id = user.subsystem_id;
    }
    
    // Filtres optionnels
    if (req.query.draw) {
      query.draw = req.query.draw;
    }
    
    if (req.query.drawTime) {
      query.draw_time = req.query.drawTime;
    }
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    if (req.query.startDate) {
      query.created_at = { $gte: new Date(req.query.startDate) };
    }
    
    if (req.query.endDate) {
      if (query.created_at) {
        query.created_at.$lte = new Date(req.query.endDate);
      } else {
        query.created_at = { $lte: new Date(req.query.endDate) };
      }
    }
    
    const tickets = await Ticket.find(query)
      .sort({ created_at: -1 })
      .limit(100);
    
    // Trouver le prochain numéro de ticket
    const lastTicket = await Ticket.findOne({ 
      subsystem_id: user.subsystem_id 
    }).sort({ ticket_number: -1 });
    
    const nextTicketNumber = lastTicket ? lastTicket.ticket_number + 1 : 1;
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.ticket_number,
        date: ticket.created_at,
        draw: ticket.draw,
        drawTime: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total_amount,
        agentName: ticket.agent_name,
        agentId: ticket.agent_id,
        subsystemId: ticket.subsystem_id
      })),
      nextTicketNumber: nextTicketNumber
    });
    
  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des tickets'
    });
  }
});

// Tickets en attente
app.get('/api/tickets/pending', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    let query = { status: 'pending' };
    
    if (user.role === 'agent') {
      query.agent_id = user._id;
    }
    
    if (user.subsystem_id) {
      query.subsystem_id = user.subsystem_id;
    }
    
    const tickets = await Ticket.find(query)
      .sort({ created_at: -1 });
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.ticket_number,
        date: ticket.created_at,
        draw: ticket.draw,
        drawTime: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total_amount,
        agentName: ticket.agent_name
      }))
    });
    
  } catch (error) {
    console.error('Erreur récupération tickets en attente:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Tickets gagnants
app.get('/api/tickets/winning', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    let query = { status: 'won' };
    
    if (user.role === 'agent') {
      query.agent_id = user._id;
    }
    
    if (user.subsystem_id) {
      query.subsystem_id = user.subsystem_id;
    }
    
    const tickets = await Ticket.find(query)
      .sort({ created_at: -1 });
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.ticket_number,
        date: ticket.created_at,
        draw: ticket.draw,
        drawTime: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total_amount,
        winning_amount: ticket.winning_amount,
        agentName: ticket.agent_name
      }))
    });
    
  } catch (error) {
    console.error('Erreur récupération tickets gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// =================== ROUTES MULTI-TIRAGES ===================

// Créer un ticket multi-tirages
app.post('/api/tickets/multi-draw', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user || user.role !== 'agent') {
      return res.status(403).json({
        success: false,
        error: 'Seuls les agents peuvent créer des tickets multi-tirages'
      });
    }
    
    const { draws, bets, total } = req.body;
    
    // Trouver le prochain numéro de ticket multi-tirages
    const lastTicket = await MultiDrawTicket.findOne({ 
      subsystem_id: user.subsystem_id 
    }).sort({ ticket_number: -1 });
    
    const nextTicketNumber = lastTicket ? lastTicket.ticket_number + 1 : 1;
    
    // Créer le ticket
    const ticket = new MultiDrawTicket({
      ticket_number: nextTicketNumber,
      subsystem_id: user.subsystem_id,
      agent_id: user._id,
      agent_name: user.name,
      draws: draws,
      bets: bets,
      total_amount: total,
      status: 'confirmed',
      created_at: new Date()
    });
    
    await ticket.save();
    
    // Mettre à jour les statistiques
    if (user.subsystem_id) {
      const subsystem = await Subsystem.findById(user.subsystem_id);
      if (subsystem) {
        subsystem.stats.total_tickets += 1;
        subsystem.stats.total_sales += total;
        await subsystem.save();
      }
    }
    
    // Historique
    const history = new History({
      subsystem_id: user.subsystem_id,
      agent_id: user._id,
      action: 'multi_draw_ticket_created',
      details: {
        ticket_number: nextTicketNumber,
        draws: draws,
        total_amount: total,
        bets_count: bets.length
      }
    });
    await history.save();
    
    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        number: ticket.ticket_number,
        date: ticket.created_at,
        draws: ticket.draws,
        bets: ticket.bets,
        total: ticket.total_amount,
        agentName: ticket.agent_name,
        agentId: ticket.agent_id,
        subsystemId: ticket.subsystem_id
      }
    });
    
  } catch (error) {
    console.error('Erreur création ticket multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création du ticket multi-tirages'
    });
  }
});

// Lister les tickets multi-tirages
app.get('/api/tickets/multi-draw', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    let query = {};
    
    if (user.role === 'agent') {
      query.agent_id = user._id;
    }
    
    if (user.subsystem_id) {
      query.subsystem_id = user.subsystem_id;
    }
    
    const tickets = await MultiDrawTicket.find(query)
      .sort({ created_at: -1 })
      .limit(50);
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.ticket_number,
        date: ticket.created_at,
        draws: ticket.draws,
        bets: ticket.bets,
        total: ticket.total_amount,
        agentName: ticket.agent_name,
        agentId: ticket.agent_id,
        subsystemId: ticket.subsystem_id
      }))
    });
    
  } catch (error) {
    console.error('Erreur récupération tickets multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// =================== ROUTES RÉSULTATS ===================

// Récupérer les résultats
app.get('/api/results', verifyNovaToken, async (req, res) => {
  try {
    const { draw, drawTime, date } = req.query;
    
    let query = {};
    
    if (draw) {
      query.draw = draw;
    }
    
    if (drawTime) {
      query.draw_time = drawTime;
    }
    
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    // Limiter à 7 jours si aucune date spécifiée
    if (!date) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      query.date = { $gte: sevenDaysAgo };
    }
    
    const results = await Result.find(query)
      .sort({ date: -1 })
      .limit(100);
    
    // Formater les résultats pour lotato.js
    const formattedResults = {};
    results.forEach(result => {
      if (!formattedResults[result.draw]) {
        formattedResults[result.draw] = {};
      }
      formattedResults[result.draw][result.draw_time] = {
        date: result.date.toISOString(),
        lot1: result.lot1,
        lot2: result.lot2,
        lot3: result.lot3
      };
    });
    
    res.json({
      success: true,
      results: formattedResults
    });
    
  } catch (error) {
    console.error('Erreur récupération résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des résultats'
    });
  }
});

// Vérifier les gagnants
app.post('/api/check-winners', verifyNovaToken, async (req, res) => {
  try {
    const { draw, drawTime, date } = req.body;
    
    const user = await User.findById(req.tokenInfo.userId);
    
    // Récupérer les résultats du tirage
    const result = await Result.findOne({
      draw: draw,
      draw_time: drawTime,
      date: new Date(date)
    });
    
    if (!result) {
      return res.json({
        success: true,
        winners: [],
        message: 'Aucun résultat trouvé pour ce tirage'
      });
    }
    
    // Récupérer les tickets pour ce tirage
    const tickets = await Ticket.find({
      subsystem_id: user.subsystem_id,
      draw: draw,
      draw_time: drawTime,
      created_at: { $lte: new Date(date) }
    });
    
    const winningTickets = [];
    
    // Vérifier chaque ticket
    tickets.forEach(ticket => {
      let totalWinnings = 0;
      const winningBets = [];
      
      ticket.bets.forEach(bet => {
        // Logique de vérification des gains (simplifiée)
        // À adapter avec les vraies règles
        const isWinner = Math.random() > 0.9; // 10% de chance pour la démo
        
        if (isWinner) {
          const winAmount = bet.amount * bet.multiplier;
          totalWinnings += winAmount;
          
          winningBets.push({
            ...bet,
            winAmount: winAmount,
            winType: 'winner'
          });
        }
      });
      
      if (winningBets.length > 0) {
        winningTickets.push({
          ticket: {
            id: ticket._id,
            number: ticket.ticket_number,
            date: ticket.created_at,
            draw: ticket.draw,
            drawTime: ticket.draw_time,
            agentName: ticket.agent_name
          },
          winningBets: winningBets,
          totalWinnings: totalWinnings,
          result: result
        });
        
        // Marquer le ticket comme gagnant
        ticket.status = 'won';
        ticket.winning_amount = totalWinnings;
        ticket.save();
      }
    });
    
    res.json({
      success: true,
      winners: winningTickets,
      result: result,
      totalWinners: winningTickets.length,
      totalWinnings: winningTickets.reduce((sum, t) => sum + t.totalWinnings, 0)
    });
    
  } catch (error) {
    console.error('Erreur vérification gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la vérification des gagnants'
    });
  }
});

// =================== ROUTES HISTORIQUE ===================

// Historique
app.get('/api/history', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    let query = { subsystem_id: user.subsystem_id };
    
    if (user.role === 'agent') {
      query.agent_id = user._id;
    }
    
    // Filtres
    if (req.query.action) {
      query.action = req.query.action;
    }
    
    if (req.query.startDate) {
      query.created_at = { $gte: new Date(req.query.startDate) };
    }
    
    if (req.query.endDate) {
      if (query.created_at) {
        query.created_at.$lte = new Date(req.query.endDate);
      } else {
        query.created_at = { $lte: new Date(req.query.endDate) };
      }
    }
    
    const history = await History.find(query)
      .sort({ created_at: -1 })
      .limit(100)
      .populate('agent_id', 'name username');
    
    res.json({
      success: true,
      history: history
    });
    
  } catch (error) {
    console.error('Erreur récupération historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Créer une entrée d'historique
app.post('/api/history', verifyNovaToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    const { action, details } = req.body;
    
    const history = new History({
      subsystem_id: user.subsystem_id,
      agent_id: user._id,
      action: action,
      details: details,
      created_at: new Date()
    });
    
    await history.save();
    
    res.json({
      success: true,
      history: history
    });
    
  } catch (error) {
    console.error('Erreur création historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// =================== ROUTES SANTÉ ET UTILITAIRES ===================

// Santé du serveur
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected',
    version: '4.6'
  });
});

// Route pour initialiser la base de données avec des données de test
app.post('/api/init-test-data', async (req, res) => {
  try {
    // Créer un sous-système de test
    const subsystem = new Subsystem({
      name: 'Nova Lotto',
      subdomain: 'nova',
      contact_email: 'nova@lotto.com',
      company_name: 'Nova Lotto',
      company_phone: '+509 32 53 49 58',
      company_address: 'Cap Haïtien',
      report_title: 'Nova Lotto',
      report_phone: '40104585',
      logo: 'logo-borlette.jpg',
      supervisor: 'Superviseur Nova',
      created_by: 'Système Master'
    });
    
    await subsystem.save();
    
    // Créer un agent de test
    const agent = new User({
      username: 'agent',
      password: 'agent123', // MOT DE PASSE EN CLAIR
      name: 'Jean Agent',
      role: 'agent',
      level: 1,
      subsystem_id: subsystem._id
    });
    
    await agent.save();
    
    // Mettre à jour le sous-système
    subsystem.admin_user = agent._id;
    await subsystem.save();
    
    // Créer un superviseur niveau 1
    const supervisor1 = new User({
      username: 'supervisor1',
      password: 'super123',
      name: 'Superviseur Niveau 1',
      role: 'supervisor',
      level: 1,
      subsystem_id: subsystem._id
    });
    
    await supervisor1.save();
    
    // Créer un superviseur niveau 2
    const supervisor2 = new User({
      username: 'supervisor2',
      password: 'super123',
      name: 'Superviseur Niveau 2',
      role: 'supervisor',
      level: 2,
      subsystem_id: subsystem._id
    });
    
    await supervisor2.save();
    
    // Ajouter des résultats de test
    const draws = ['miami', 'georgia', 'newyork', 'texas', 'tunisia'];
    const times = ['morning', 'evening'];
    
    for (let i = 0; i < 3; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      for (const draw of draws) {
        for (const time of times) {
          const result = new Result({
            draw: draw,
            draw_time: time,
            date: date,
            lot1: Math.floor(100 + Math.random() * 900).toString(),
            lot2: Math.floor(10 + Math.random() * 90).toString().padStart(2, '0'),
            lot3: Math.floor(10 + Math.random() * 90).toString().padStart(2, '0'),
            subsystem_id: subsystem._id
          });
          
          await result.save();
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Données de test initialisées',
      subsystem: {
        name: subsystem.name,
        logo: subsystem.logo
      },
      users: [
        { role: 'agent', username: 'agent', password: 'agent123' },
        { role: 'supervisor1', username: 'supervisor1', password: 'super123' },
        { role: 'supervisor2', username: 'supervisor2', password: 'super123' }
      ]
    });
    
  } catch (error) {
    console.error('Erreur initialisation données test:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Route pour créer un utilisateur (pour tests)
app.post('/api/create-user', async (req, res) => {
  try {
    const { username, password, name, role, level, subsystem_id } = req.body;
    
    const user = new User({
      username: username,
      password: password, // EN CLAIR
      name: name,
      role: role || 'agent',
      level: level || 1,
      subsystem_id: subsystem_id || null,
      is_active: true
    });
    
    await user.save();
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level
      }
    });
    
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// =================== ROUTES MASTER (simplifiées) ===================

// Route master login (simplifiée)
app.post('/api/master/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ 
      username: username,
      password: password, // EN CLAIR
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
        level: user.level
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

// =================== ROUTES HTML ===================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
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

// =================== GESTION D'ERREURS ===================

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

// =================== DÉMARRAGE SERVEUR ===================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur Lotato démarré sur le port ${PORT}`);
  console.log(`📁 Compression GZIP activée`);
  console.log(`🌐 CORS activé`);
  console.log(`🗄️  Base de données: ${MONGODB_URI}`);
  console.log('');
  console.log('📋 Routes API LOTATO disponibles:');
  console.log('  POST   /api/auth/login                - Connexion (mots de passe en clair)');
  console.log('  GET    /api/auth/check                - Vérifier session (token nova_)');
  console.log('  POST   /api/auth/verify-token         - Vérifier token');
  console.log('');
  console.log('  GET    /api/subsystem/info            - Infos sous-système');
  console.log('  GET    /api/company-info              - Infos entreprise');
  console.log('  GET    /api/logo                      - Logo');
  console.log('');
  console.log('  POST   /api/tickets                   - Créer ticket');
  console.log('  GET    /api/tickets                   - Lister tickets');
  console.log('  GET    /api/tickets/pending           - Tickets en attente');
  console.log('  GET    /api/tickets/winning           - Tickets gagnants');
  console.log('');
  console.log('  POST   /api/tickets/multi-draw        - Ticket multi-tirages');
  console.log('  GET    /api/tickets/multi-draw        - Lister multi-tirages');
  console.log('');
  console.log('  GET    /api/results                   - Récupérer résultats');
  console.log('  POST   /api/check-winners             - Vérifier gagnants');
  console.log('');
  console.log('  GET    /api/history                   - Historique');
  console.log('  POST   /api/history                   - Ajouter historique');
  console.log('');
  console.log('  GET    /api/health                    - Santé serveur');
  console.log('  POST   /api/init-test-data            - Initialiser données test');
  console.log('  POST   /api/create-user               - Créer utilisateur (test)');
  console.log('  POST   /api/master/login              - Connexion master');
  console.log('');
  console.log('👨‍💼 Comptes de test créés:');
  console.log('   Agent: username=agent, password=agent123');
  console.log('   Supervisor1: username=supervisor1, password=super123');
  console.log('   Supervisor2: username=supervisor2, password=super123');
  console.log('');
  console.log('⚠️  IMPORTANT: Pour utiliser Lotato, exécutez d\'abord:');
  console.log('   POST /api/init-test-data pour créer un sous-système et utilisateurs de test');
  console.log('');
  console.log('🌐 URLs:');
  console.log(`   Login: http://localhost:${PORT}/`);
  console.log(`   Lotato (agent): http://localhost:${PORT}/lotato.html`);
});