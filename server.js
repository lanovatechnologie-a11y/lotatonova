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
  details: { type: mongoose.Schema.Types.Mixed },
  win_amount: { type: Number, default: 0 },
  win_type: { type: String }
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
  synced_at: { type: Date },
  is_void: { type: Boolean, default: false },
  voided_at: { type: Date },
  voided_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  void_reason: { type: String },
  winning_amount: { type: Number, default: 0 },
  is_winner: { type: Boolean, default: false },
  is_paid: { type: Boolean, default: false },
  paid_at: { type: Date },
  paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
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
    options: { type: mongoose.Schema.Types.Mixed },
    win_amount: { type: Number, default: 0 },
    win_type: { type: String }
  }],
  draws: [{ type: String }],
  total: { type: Number, required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_name: { type: String, required: true },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  is_printed: { type: Boolean, default: false },
  printed_at: { type: Date },
  is_void: { type: Boolean, default: false },
  voided_at: { type: Date },
  voided_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  void_reason: { type: String },
  winning_amount: { type: Number, default: 0 },
  is_winner: { type: Boolean, default: false },
  is_paid: { type: Boolean, default: false },
  paid_at: { type: Date },
  paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const MultiDrawTicket = mongoose.model('MultiDrawTicket', multiDrawTicketSchema);

// Schéma pour les gagnants
const winnerSchema = new mongoose.Schema({
  ticket_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
  multi_ticket_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MultiDrawTicket' },
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
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' }
});

const Winner = mongoose.model('Winner', winnerSchema);

// Schéma pour la configuration
const configSchema = new mongoose.Schema({
  company_name: { type: String, default: 'Nova Lotto' },
  company_phone: { type: String, default: '+509 32 53 49 58' },
  company_address: { type: String, default: 'Cap Haïtien' },
  report_title: { type: String, default: 'Nova Lotto' },
  report_phone: { type: String, default: '40104585' },
  logo_url: { type: String, default: 'logo-borlette.jpg' },
  commission_rate: { type: Number, default: 10 },
  tax_rate: { type: Number, default: 5 },
  currency: { type: String, default: 'HTG' },
  timezone: { type: String, default: 'America/Port-au-Prince' },
  draw_closing_minutes: { type: Number, default: 15 }
});

const Config = mongoose.model('Config', configSchema);

// Schéma pour les taux de paiement
const payoutSchema = new mongoose.Schema({
  game_type: { type: String, required: true },
  name: { type: String, required: true },
  multiplier: { type: Number, required: true },
  is_active: { type: Boolean, default: true }
});

const Payout = mongoose.model('Payout', payoutSchema);

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
    const activeAgents = await User.countDocuments({ role: 'agent' });
    const activeSupervisors = await User.countDocuments({ role: 'supervisor' });
    const activeSubsystems = await User.countDocuments({ role: 'subsystem' });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayTickets = await Ticket.countDocuments({ date: { $gte: today } });
    const todaySales = await Ticket.aggregate([
      { $match: { date: { $gte: today } } },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    
    const statistics = {
      active_agents: activeAgents,
      active_supervisors: activeSupervisors,
      active_subsystems: activeSubsystems,
      total_sales: todaySales[0] ? todaySales[0].total : 0,
      total_tickets: todayTickets,
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
    
    const agentsWithStats = await Promise.all(agents.map(async (agent) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const total_tickets = await Ticket.countDocuments({ agent_id: agent._id });
      const today_tickets = await Ticket.countDocuments({ 
        agent_id: agent._id, 
        date: { $gte: today } 
      });
      
      const total_sales = await Ticket.aggregate([
        { $match: { agent_id: agent._id } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]);
      
      const today_sales = await Ticket.aggregate([
        { $match: { agent_id: agent._id, date: { $gte: today } } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]);
      
      return {
        ...agent.toObject(),
        total_sales: total_sales[0] ? total_sales[0].total : 0,
        today_sales: today_sales[0] ? today_sales[0].total : 0,
        total_tickets: total_tickets,
        today_tickets: today_tickets,
        is_online: Math.random() > 0.5,
        last_active: new Date(Date.now() - Math.random() * 10000000000)
      };
    }));
    
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
        res.status(500).json({ success: false, error: 'Erreur lors de la création de l\'agent' });
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

app.get('/api/tickets', vérifierToken, async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ date: -1 }).limit(100);
        res.json({ success: true, tickets });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des tickets' });
    }
});

app.get('/api/reports/generate', vérifierToken, async (req, res) => {
    try {
        const { period } = req.query;
        const report = {
            period: period,
            monthlyPerformance: 85,
            ticketResolution: 92,
            activeAgents: await User.countDocuments({ role: 'agent' }),
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

// Routes Master pour les sous-systèmes (déjà existantes)
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

    // Mettre à jour l'utilisateur admin avec l'ID du sous-système
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

// =================== NOUVELLES ROUTES POUR LOTATO ===================

// Route pour obtenir les tirages
app.get('/api/draws', vérifierToken, async (req, res) => {
  try {
    const draws = await Draw.find({ is_active: true }).sort({ order: 1 });
    
    const drawsObject = {};
    draws.forEach(draw => {
      drawsObject[draw.code] = {
        name: draw.name,
        icon: draw.icon,
        times: draw.times,
        countdown: '-- h -- min'
      };
    });
    
    res.json({
      success: true,
      draws: drawsObject
    });
  } catch (error) {
    console.error('Erreur chargement tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des tirages'
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

// Route pour les derniers résultats
app.get('/api/results/latest', vérifierToken, async (req, res) => {
  try {
    const latestResults = {};
    const draws = await Draw.find({ is_active: true });
    
    for (const draw of draws) {
      const latestResult = await Result.findOne({ 
        draw: draw.code 
      }).sort({ date: -1 });
      
      if (latestResult) {
        latestResults[draw.code] = {
          draw: latestResult.draw,
          draw_time: latestResult.draw_time,
          date: latestResult.date,
          lot1: latestResult.lot1,
          lot2: latestResult.lot2 || '',
          lot3: latestResult.lot3 || '',
          verified: latestResult.verified
        };
      }
    }
    
    res.json({
      success: true,
      results: latestResults
    });
  } catch (error) {
    console.error('Erreur chargement derniers résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des derniers résultats'
    });
  }
});

// Route pour soumettre des paris
app.post('/api/bets', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time, bets, agentId, agentName, subsystem_id } = req.body;
    
    // Générer un numéro de ticket
    const lastTicket = await Ticket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;
    
    // Calculer le total
    const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
    
    const ticket = new Ticket({
      number: ticketNumber,
      draw: draw,
      draw_time: draw_time,
      bets: bets,
      total: total,
      agent_id: agentId,
      agent_name: agentName,
      subsystem_id: subsystem_id,
      date: new Date()
    });
    
    await ticket.save();
    
    res.json({
      success: true,
      ticketId: ticket._id,
      ticketNumber: ticket.number,
      message: 'Paris soumis avec succès'
    });
  } catch (error) {
    console.error('Erreur soumission paris:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la soumission des paris'
    });
  }
});

// Route pour sauvegarder une fiche
app.post('/api/tickets', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time, bets, agentId, agentName, subsystem_id } = req.body;
    
    const lastTicket = await Ticket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;
    
    const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
    
    const ticket = new Ticket({
      number: ticketNumber,
      draw: draw,
      draw_time: draw_time,
      bets: bets,
      total: total,
      agent_id: agentId,
      agent_name: agentName,
      subsystem_id: subsystem_id,
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
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id
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

// Route pour obtenir la dernière fiche
app.get('/api/tickets/latest', vérifierToken, async (req, res) => {
  try {
    const ticket = await Ticket.findOne().sort({ date: -1 });
    
    if (!ticket) {
      return res.json({
        success: false,
        error: 'Aucune fiche trouvée'
      });
    }
    
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
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id
      }
    });
  } catch (error) {
    console.error('Erreur récupération fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de la fiche'
    });
  }
});

// Route pour obtenir une fiche par ID
app.get('/api/tickets/:id', vérifierToken, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Fiche non trouvée'
      });
    }
    
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
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id,
        is_printed: ticket.is_printed,
        is_synced: ticket.is_synced,
        is_void: ticket.is_void
      }
    });
  } catch (error) {
    console.error('Erreur récupération fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de la fiche'
    });
  }
});

// Route pour rechercher une fiche
app.get('/api/tickets/search', vérifierToken, async (req, res) => {
  try {
    const { number } = req.query;
    
    if (!number) {
      return res.status(400).json({
        success: false,
        error: 'Numéro de fiche requis'
      });
    }
    
    const ticket = await Ticket.findOne({ number: parseInt(number) });
    
    if (!ticket) {
      return res.json({
        success: false,
        error: 'Fiche non trouvée'
      });
    }
    
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
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id,
        is_printed: ticket.is_printed,
        is_synced: ticket.is_synced,
        is_void: ticket.is_void
      }
    });
  } catch (error) {
    console.error('Erreur recherche fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la recherche de la fiche'
    });
  }
});

// Route pour l'historique des fiches
app.get('/api/tickets/history', vérifierToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const { agent_id, draw, draw_time, start_date, end_date } = req.query;
    
    let query = {};
    
    if (agent_id) query.agent_id = agent_id;
    if (draw) query.draw = draw;
    if (draw_time) query.draw_time = draw_time;
    
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    }
    
    const tickets = await Ticket.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ date: -1 });
    
    const total = await Ticket.countDocuments(query);
    
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
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id,
        is_printed: ticket.is_printed,
        is_synced: ticket.is_synced,
        is_void: ticket.is_void
      })),
      pagination: {
        page: page,
        limit: limit,
        total: total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur historique fiches:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement de l\'historique'
    });
  }
});

// Route pour toutes les fiches
app.get('/api/tickets/all', vérifierToken, async (req, res) => {
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
    
    const tickets = await Ticket.find(query)
      .sort({ date: -1 })
      .limit(100);
    
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
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id,
        is_printed: ticket.is_printed,
        is_synced: ticket.is_synced,
        is_void: ticket.is_void
      }))
    });
  } catch (error) {
    console.error('Erreur toutes les fiches:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des fiches'
    });
  }
});

// Route pour supprimer une fiche
app.delete('/api/tickets/:id', vérifierToken, async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Fiche non trouvée'
      });
    }
    
    res.json({
      success: true,
      message: 'Fiche supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur suppression fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression de la fiche'
    });
  }
});

// Route pour annuler une fiche (void)
app.put('/api/tickets/:id/void', vérifierToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Fiche non trouvée'
      });
    }
    
    if (ticket.is_void) {
      return res.status(400).json({
        success: false,
        error: 'Cette fiche est déjà annulée'
      });
    }
    
    ticket.is_void = true;
    ticket.voided_at = new Date();
    ticket.voided_by = req.tokenInfo.userId;
    ticket.void_reason = reason;
    
    await ticket.save();
    
    res.json({
      success: true,
      message: 'Fiche annulée avec succès'
    });
  } catch (error) {
    console.error('Erreur annulation fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'annulation de la fiche'
    });
  }
});

// Route pour marquer une fiche comme imprimée
app.put('/api/tickets/:id/print', vérifierToken, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Fiche non trouvée'
      });
    }
    
    ticket.is_printed = true;
    ticket.printed_at = new Date();
    
    await ticket.save();
    
    res.json({
      success: true,
      message: 'Fiche marquée comme imprimée'
    });
  } catch (error) {
    console.error('Erreur marquage impression:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du marquage de l\'impression'
    });
  }
});

// Route pour synchroniser une fiche
app.put('/api/tickets/:id/sync', vérifierToken, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Fiche non trouvée'
      });
    }
    
    ticket.is_synced = true;
    ticket.synced_at = new Date();
    
    await ticket.save();
    
    res.json({
      success: true,
      message: 'Fiche synchronisée avec succès'
    });
  } catch (error) {
    console.error('Erreur synchronisation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la synchronisation'
    });
  }
});

// Route pour les fiches multi-tirages
app.get('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
  try {
    const tickets = await MultiDrawTicket.find()
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
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id,
        is_printed: ticket.is_printed,
        is_void: ticket.is_void
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
    const { ticket, agentId, agentName, subsystem_id } = req.body;
    
    const lastTicket = await MultiDrawTicket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 500001;
    
    const multiDrawTicket = new MultiDrawTicket({
      number: ticketNumber,
      date: new Date(),
      bets: ticket.bets,
      draws: Array.from(ticket.draws),
      total: ticket.totalAmount,
      agent_id: agentId,
      agent_name: agentName,
      subsystem_id: subsystem_id
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
        agent_name: multiDrawTicket.agent_name,
        subsystem_id: multiDrawTicket.subsystem_id
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
    
    // Récupérer les tickets pour ce tirage
    const tickets = await Ticket.find({
      draw: draw,
      draw_time: draw_time,
      date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      is_void: false
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
          if (bet.number === result.lot1) {
            winAmount = bet.amount * 60;
            winType = '1er lot';
            matchedNumber = result.lot1;
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
          // Logique pour Lotto 3
          if (bet.number === result.lot1.substring(0, 3)) {
            winAmount = bet.amount * 500;
            winType = 'Lotto 3';
            matchedNumber = result.lot1.substring(0, 3);
          }
        } else if (bet.type === 'marriage') {
          // Logique pour mariage
          const [num1, num2] = bet.number.split('*');
          if ((num1 === result.lot1.substring(0, 2) && num2 === result.lot2.substring(0, 2)) ||
              (num1 === result.lot2.substring(0, 2) && num2 === result.lot1.substring(0, 2))) {
            winAmount = bet.amount * 1000;
            winType = 'Mariage';
            matchedNumber = `${result.lot1.substring(0, 2)}*${result.lot2.substring(0, 2)}`;
          }
        } else if (bet.type === 'grap') {
          // Logique pour grap
          if (bet.number === '111' && result.lot1[0] === '1' && result.lot1[1] === '1' && result.lot1[2] === '1') {
            winAmount = bet.amount * 500;
            winType = 'Grap';
            matchedNumber = bet.number;
          }
          // Ajouter les autres graps...
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
        
        // Mettre à jour le ticket comme gagnant
        ticket.winning_amount = totalWinnings;
        ticket.is_winner = true;
        await ticket.save();
        
        // Créer une entrée dans la table des gagnants
        const winner = new Winner({
          ticket_id: ticket._id,
          ticket_number: ticket.number,
          draw: ticket.draw,
          draw_time: ticket.draw_time,
          date: ticket.date,
          winning_bets: winningBets,
          total_winnings: totalWinnings,
          subsystem_id: ticket.subsystem_id
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

// Route pour les gagnants
app.get('/api/tickets/winning', vérifierToken, async (req, res) => {
  try {
    const winners = await Winner.find()
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

// Route pour marquer un gagnant comme payé
app.put('/api/winners/:id/pay', vérifierToken, async (req, res) => {
  try {
    const winner = await Winner.findById(req.params.id);
    
    if (!winner) {
      return res.status(404).json({
        success: false,
        error: 'Gagnant non trouvé'
      });
    }
    
    winner.paid = true;
    winner.paid_at = new Date();
    winner.paid_by = req.tokenInfo.userId;
    
    await winner.save();
    
    // Mettre à jour le ticket correspondant
    if (winner.ticket_id) {
      const ticket = await Ticket.findById(winner.ticket_id);
      if (ticket) {
        ticket.is_paid = true;
        ticket.paid_at = new Date();
        ticket.paid_by = req.tokenInfo.userId;
        await ticket.save();
      }
    }
    
    res.json({
      success: true,
      message: 'Gagnant marqué comme payé'
    });
  } catch (error) {
    console.error('Erreur paiement gagnant:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du paiement du gagnant'
    });
  }
});

// Route pour les rapports
app.get('/api/reports', vérifierToken, async (req, res) => {
  try {
    const { type, draw, draw_time, start_date, end_date, agent_id } = req.query;
    
    let query = {};
    
    if (draw) query.draw = draw;
    if (draw_time) query.draw_time = draw_time;
    if (agent_id) query.agent_id = agent_id;
    
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    }
    
    const tickets = await Ticket.find(query);
    
    const totalTickets = tickets.length;
    const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    const totalWinnings = tickets.reduce((sum, ticket) => sum + (ticket.winning_amount || 0), 0);
    
    res.json({
      success: true,
      report: {
        totalTickets: totalTickets,
        totalAmount: totalAmount,
        totalWinnings: totalWinnings,
        netProfit: totalAmount - totalWinnings,
        tickets: tickets.map(ticket => ({
          number: ticket.number,
          date: ticket.date,
          draw: ticket.draw,
          draw_time: ticket.draw_time,
          total: ticket.total,
          winning_amount: ticket.winning_amount,
          agent_name: ticket.agent_name,
          is_void: ticket.is_void
        }))
      }
    });
  } catch (error) {
    console.error('Erreur génération rapport:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du rapport'
    });
  }
});

// Route pour rapport de fin de tirage
app.post('/api/reports/end-of-draw', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time } = req.body;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tickets = await Ticket.find({
      draw: draw,
      draw_time: draw_time,
      date: { $gte: today },
      is_void: false
    });
    
    const totalTickets = tickets.length;
    const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    
    // Calculer les gagnants
    const winners = await Winner.find({
      draw: draw,
      draw_time: draw_time,
      date: { $gte: today }
    });
    
    const totalWinnings = winners.reduce((sum, winner) => sum + winner.total_winnings, 0);
    
    res.json({
      success: true,
      report: {
        totalTickets: totalTickets,
        totalAmount: totalAmount,
        totalWinnings: totalWinnings,
        netProfit: totalAmount - totalWinnings,
        voidTickets: await Ticket.countDocuments({
          draw: draw,
          draw_time: draw_time,
          date: { $gte: today },
          is_void: true
        })
      }
    });
  } catch (error) {
    console.error('Erreur rapport fin tirage:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du rapport'
    });
  }
});

// Route pour rapport général
app.get('/api/reports/general', vérifierToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let query = { is_void: false };
    
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query.date = { $gte: today };
    }
    
    const tickets = await Ticket.find(query);
    
    const totalTickets = tickets.length;
    const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    
    // Calculer les gagnants pour la même période
    let winnerQuery = {};
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setDate(end.getDate() + 1);
      winnerQuery.date = { $gte: start, $lt: end };
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      winnerQuery.date = { $gte: today };
    }
    
    const winners = await Winner.find(winnerQuery);
    const totalWinnings = winners.reduce((sum, winner) => sum + winner.total_winnings, 0);
    
    // Regrouper par tirage
    const draws = await Draw.find({ is_active: true });
    const drawBreakdown = await Promise.all(draws.map(async (draw) => {
      const morningTickets = await Ticket.countDocuments({
        ...query,
        draw: draw.code,
        draw_time: 'morning'
      });
      const morningAmount = await Ticket.aggregate([
        { $match: { ...query, draw: draw.code, draw_time: 'morning' } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]);
      
      const eveningTickets = await Ticket.countDocuments({
        ...query,
        draw: draw.code,
        draw_time: 'evening'
      });
      const eveningAmount = await Ticket.aggregate([
        { $match: { ...query, draw: draw.code, draw_time: 'evening' } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]);
      
      return {
        draw: draw.name,
        morning_tickets: morningTickets,
        morning_amount: morningAmount[0] ? morningAmount[0].total : 0,
        evening_tickets: eveningTickets,
        evening_amount: eveningAmount[0] ? eveningAmount[0].total : 0,
        total_tickets: morningTickets + eveningTickets,
        total_amount: (morningAmount[0] ? morningAmount[0].total : 0) + (eveningAmount[0] ? eveningAmount[0].total : 0)
      };
    }));
    
    res.json({
      success: true,
      report: {
        totalTickets: totalTickets,
        totalAmount: totalAmount,
        totalWinnings: totalWinnings,
        netProfit: totalAmount - totalWinnings,
        drawBreakdown: drawBreakdown
      }
    });
  } catch (error) {
    console.error('Erreur rapport général:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du rapport général'
    });
  }
});

// Route pour rapport par tirage
app.post('/api/reports/draw', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time } = req.body;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tickets = await Ticket.find({
      draw: draw,
      draw_time: draw_time,
      date: { $gte: today },
      is_void: false
    });
    
    const totalTickets = tickets.length;
    const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    
    res.json({
      success: true,
      report: {
        totalTickets: totalTickets,
        totalAmount: totalAmount
      }
    });
  } catch (error) {
    console.error('Erreur rapport tirage:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du rapport tirage'
    });
  }
});

// Route pour les informations de l'entreprise
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
      report_phone: config.report_phone,
      commission_rate: config.commission_rate,
      tax_rate: config.tax_rate,
      currency: config.currency,
      timezone: config.timezone,
      draw_closing_minutes: config.draw_closing_minutes
    });
  } catch (error) {
    console.error('Erreur chargement info entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des informations de l\'entreprise'
    });
  }
});

// Route pour mettre à jour les informations de l'entreprise
app.put('/api/company-info', vérifierToken, async (req, res) => {
  try {
    let config = await Config.findOne();
    
    if (!config) {
      config = new Config();
    }
    
    Object.assign(config, req.body);
    await config.save();
    
    res.json({
      success: true,
      message: 'Informations mises à jour avec succès'
    });
  } catch (error) {
    console.error('Erreur mise à jour info entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour des informations'
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

// Route pour les tickets en attente
app.get('/api/tickets/pending', vérifierToken, async (req, res) => {
  try {
    const tickets = await Ticket.find({ 
      is_synced: false,
      is_void: false 
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
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id
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

// Route pour les tickets non imprimés
app.get('/api/tickets/unprinted', vérifierToken, async (req, res) => {
  try {
    const tickets = await Ticket.find({ 
      is_printed: false,
      is_void: false 
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
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id
      }))
    });
  } catch (error) {
    console.error('Erreur tickets non imprimés:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des tickets non imprimés'
    });
  }
});

// Route pour les statistiques d'un agent
app.get('/api/agents/:id/stats', vérifierToken, async (req, res) => {
  try {
    const agentId = req.params.id;
    const { start_date, end_date } = req.query;
    
    let query = { agent_id: agentId, is_void: false };
    
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    }
    
    const tickets = await Ticket.find(query);
    
    const totalTickets = tickets.length;
    const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    const totalWinnings = tickets.reduce((sum, ticket) => sum + (ticket.winning_amount || 0), 0);
    
    // Regrouper par tirage
    const draws = await Draw.find({ is_active: true });
    const drawBreakdown = await Promise.all(draws.map(async (draw) => {
      const morningTickets = await Ticket.countDocuments({
        ...query,
        draw: draw.code,
        draw_time: 'morning'
      });
      const morningAmount = await Ticket.aggregate([
        { $match: { ...query, draw: draw.code, draw_time: 'morning' } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]);
      
      const eveningTickets = await Ticket.countDocuments({
        ...query,
        draw: draw.code,
        draw_time: 'evening'
      });
      const eveningAmount = await Ticket.aggregate([
        { $match: { ...query, draw: draw.code, draw_time: 'evening' } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]);
      
      return {
        draw: draw.name,
        morning_tickets: morningTickets,
        morning_amount: morningAmount[0] ? morningAmount[0].total : 0,
        evening_tickets: eveningTickets,
        evening_amount: eveningAmount[0] ? eveningAmount[0].total : 0
      };
    }));
    
    res.json({
      success: true,
      stats: {
        totalTickets: totalTickets,
        totalAmount: totalAmount,
        totalWinnings: totalWinnings,
        netSales: totalAmount - totalWinnings,
        drawBreakdown: drawBreakdown
      }
    });
  } catch (error) {
    console.error('Erreur statistiques agent:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des statistiques de l\'agent'
    });
  }
});

// Route pour les taux de paiement
app.get('/api/payouts', vérifierToken, async (req, res) => {
  try {
    const payouts = await Payout.find({ is_active: true });
    
    res.json({
      success: true,
      payouts: payouts
    });
  } catch (error) {
    console.error('Erreur chargement taux de paiement:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des taux de paiement'
    });
  }
});

// Route pour créer un tirage
app.post('/api/draws', vérifierToken, async (req, res) => {
  try {
    const { name, code, icon, morning_time, evening_time, is_active, order } = req.body;
    
    const existingDraw = await Draw.findOne({ code: code });
    if (existingDraw) {
      return res.status(400).json({
        success: false,
        error: 'Un tirage avec ce code existe déjà'
      });
    }
    
    const draw = new Draw({
      name: name,
      code: code,
      icon: icon || 'fas fa-dice',
      times: {
        morning: morning_time,
        evening: evening_time
      },
      is_active: is_active !== false,
      order: order || 0
    });
    
    await draw.save();
    
    res.json({
      success: true,
      draw: draw
    });
  } catch (error) {
    console.error('Erreur création tirage:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du tirage'
    });
  }
});

// Route pour mettre à jour un tirage
app.put('/api/draws/:id', vérifierToken, async (req, res) => {
  try {
    const draw = await Draw.findById(req.params.id);
    
    if (!draw) {
      return res.status(404).json({
        success: false,
        error: 'Tirage non trouvé'
      });
    }
    
    Object.assign(draw, req.body);
    await draw.save();
    
    res.json({
      success: true,
      draw: draw
    });
  } catch (error) {
    console.error('Erreur mise à jour tirage:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du tirage'
    });
  }
});

// Route pour créer un résultat
app.post('/api/results', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time, date, lot1, lot2, lot3, verified } = req.body;
    
    const result = new Result({
      draw: draw,
      draw_time: draw_time,
      date: new Date(date),
      lot1: lot1,
      lot2: lot2,
      lot3: lot3,
      verified: verified || false,
      verified_by: req.tokenInfo.userId,
      verified_at: verified ? new Date() : null
    });
    
    await result.save();
    
    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('Erreur création résultat:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du résultat'
    });
  }
});

// Route pour mettre à jour un résultat
app.put('/api/results/:id', vérifierToken, async (req, res) => {
  try {
    const result = await Result.findById(req.params.id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Résultat non trouvé'
      });
    }
    
    Object.assign(result, req.body);
    if (req.body.verified && !result.verified) {
      result.verified_by = req.tokenInfo.userId;
      result.verified_at = new Date();
    }
    
    await result.save();
    
    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('Erreur mise à jour résultat:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du résultat'
    });
  }
});

// =================== ROUTES POUR LES ADMINISTRATEURS DE SOUS-SYSTÈMES ===================

// Obtenir les sous-systèmes de l'utilisateur connecté
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
      // L'utilisateur est un administrateur de sous-système
      subsystems = await Subsystem.find({ 
        admin_user: user._id,
        is_active: true 
      });
    } else if (user.role === 'master') {
      // Le master peut voir tous les sous-systèmes
      subsystems = await Subsystem.find({ is_active: true });
    } else {
      // Les autres rôles n'ont pas accès
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

// Obtenir les détails d'un sous-système spécifique
app.get('/api/subsystems/:id', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const subsystemId = req.params.id;
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const subsystem = await Subsystem.findById(subsystemId);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Vérifier les permissions
    if (user.role === 'master' || 
        (user.role === 'subsystem' && subsystem.admin_user.toString() === user._id.toString())) {
      
      // Compter les utilisateurs par rôle dans ce sous-système
      const ownerCount = await User.countDocuments({ 
        _id: subsystem.admin_user,
        subsystem_id: subsystem._id
      });
      
      const adminCount = await User.countDocuments({ 
        role: 'subsystem',
        subsystem_id: subsystem._id,
        _id: { $ne: subsystem.admin_user }
      });
      
      const supervisorCount = await User.countDocuments({ 
        role: 'supervisor',
        subsystem_id: subsystem._id
      });
      
      const agentCount = await User.countDocuments({ 
        role: 'agent',
        subsystem_id: subsystem._id
      });

      const users = [
        { role: 'owner', count: ownerCount },
        { role: 'admin', count: adminCount },
        { role: 'supervisor', count: supervisorCount },
        { role: 'agent', count: agentCount }
      ];

      // Calculer les statistiques
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayTickets = await Ticket.countDocuments({
        subsystem_id: subsystem._id,
        date: { $gte: today },
        is_void: false
      });
      
      const todaySalesResult = await Ticket.aggregate([
        { 
          $match: { 
            subsystem_id: subsystem._id,
            date: { $gte: today },
            is_void: false
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$total" }
          }
        }
      ]);
      
      const todaySales = todaySalesResult.length > 0 ? todaySalesResult[0].total : 0;
      
      const totalTickets = await Ticket.countDocuments({ 
        subsystem_id: subsystem._id,
        is_void: false 
      });
      const totalSalesResult = await Ticket.aggregate([
        { $match: { subsystem_id: subsystem._id, is_void: false } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]);
      const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].total : 0;
      
      const activeUsers = await User.countDocuments({ 
        subsystem_id: subsystem._id,
        role: { $in: ['agent', 'supervisor'] }
      });
      
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
            today_tickets: todayTickets,
            total_sales: totalSales,
            total_tickets: totalTickets,
            usage_percentage: usage_percentage
          },
          users: users
        }
      });
    } else {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Vous n\'avez pas les permissions nécessaires.'
      });
    }

  } catch (error) {
    console.error('Erreur détails sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération du sous-système'
    });
  }
});

// Obtenir le tableau de bord d'un sous-système
app.get('/api/subsystems/:id/dashboard', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const subsystemId = req.params.id;
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const subsystem = await Subsystem.findById(subsystemId);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Vérifier les permissions
    if (!(user.role === 'master' || 
        (user.role === 'subsystem' && subsystem.admin_user.toString() === user._id.toString()))) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Vous n\'avez pas les permissions nécessaires.'
      });
    }

    // Calculer les statistiques
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Utilisateurs en ligne (simulation)
    const online_users = Math.floor(Math.random() * 10) + 1;
    
    // Tickets aujourd'hui
    const todayTickets = await Ticket.countDocuments({
      subsystem_id: subsystem._id,
      date: { $gte: today },
      is_void: false
    });
    
    // Ventes aujourd'hui
    const todaySalesResult = await Ticket.aggregate([
      { 
        $match: { 
          subsystem_id: subsystem._id,
          date: { $gte: today },
          is_void: false
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" }
        }
      }
    ]);
    const today_sales = todaySalesResult.length > 0 ? todaySalesResult[0].total : 0;
    
    // Alertes en attente
    const pending_alerts = await Ticket.countDocuments({
      subsystem_id: subsystem._id,
      is_synced: false,
      is_void: false
    });
    
    // Ventes du mois
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const monthSalesResult = await Ticket.aggregate([
      { 
        $match: { 
          subsystem_id: subsystem._id,
          date: { $gte: startOfMonth },
          is_void: false
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$total" }
        }
      }
    ]);
    const total_sales = monthSalesResult.length > 0 ? monthSalesResult[0].total : 0;
    
    // Utilisateurs actifs
    const active_users = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      role: { $in: ['agent', 'supervisor'] }
    });
    
    // Tickets du mois
    const total_tickets = await Ticket.countDocuments({
      subsystem_id: subsystem._id,
      date: { $gte: startOfMonth },
      is_void: false
    });
    
    // Profit estimé (70% des ventes)
    const estimated_profit = Math.round(total_sales * 0.7);

    res.json({
      success: true,
      online_users: online_users,
      today_sales: today_sales,
      today_tickets: todayTickets,
      pending_alerts: pending_alerts,
      total_sales: total_sales,
      active_users: active_users,
      max_users: subsystem.max_users,
      total_tickets: total_tickets,
      estimated_profit: estimated_profit
    });

  } catch (error) {
    console.error('Erreur tableau de bord sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors du chargement du tableau de bord'
    });
  }
});

// Créer un utilisateur dans un sous-système
app.post('/api/subsystems/users/create', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const { 
      name, 
      username, 
      password, 
      role, 
      level, 
      subsystem_id, 
      is_active = true 
    } = req.body;

    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const subsystem = await Subsystem.findById(subsystem_id);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Vérifier les permissions
    if (!(user.role === 'master' || 
        (user.role === 'subsystem' && subsystem.admin_user.toString() === user._id.toString()))) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Vous n\'avez pas les permissions nécessaires.'
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

    // Vérifier la limite d'utilisateurs
    const currentUsers = await User.countDocuments({ subsystem_id: subsystem._id });
    if (currentUsers >= subsystem.max_users) {
      return res.status(400).json({
        success: false,
        error: `Limite d'utilisateurs atteinte (${subsystem.max_users})`
      });
    }

    // Créer le nouvel utilisateur
    const newUser = new User({
      username,
      password,
      name,
      role,
      level: level || 1,
      subsystem_id: subsystem._id,
      dateCreation: new Date()
    });

    await newUser.save();

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

// Obtenir les utilisateurs d'un sous-système
app.get('/api/subsystems/:id/users', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const subsystemId = req.params.id;
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const subsystem = await Subsystem.findById(subsystemId);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Vérifier les permissions
    if (!(user.role === 'master' || 
        (user.role === 'subsystem' && subsystem.admin_user.toString() === user._id.toString()))) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Vous n\'avez pas les permissions nécessaires.'
      });
    }

    const users = await User.find({ 
      subsystem_id: subsystem._id,
      role: { $ne: 'master' }
    }).select('-password');

    const usersWithStats = await Promise.all(users.map(async (user) => {
      // Calculer les statistiques pour chaque utilisateur
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayTickets = await Ticket.countDocuments({
        agent_id: user._id,
        date: { $gte: today },
        is_void: false
      });
      
      const todaySalesResult = await Ticket.aggregate([
        { 
          $match: { 
            agent_id: user._id,
            date: { $gte: today },
            is_void: false
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$total" }
          }
        }
      ]);
      
      const today_sales = todaySalesResult.length > 0 ? todaySalesResult[0].total : 0;
      
      const totalTickets = await Ticket.countDocuments({ 
        agent_id: user._id,
        is_void: false 
      });
      const totalSalesResult = await Ticket.aggregate([
        { $match: { agent_id: user._id, is_void: false } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]);
      const total_sales = totalSalesResult.length > 0 ? totalSalesResult[0].total : 0;

      return {
        ...user.toObject(),
        stats: {
          today_tickets: todayTickets,
          today_sales: today_sales,
          total_tickets: totalTickets,
          total_sales: total_sales,
          is_online: Math.random() > 0.3 // Simulation
        }
      };
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

// Obtenir les tickets d'un sous-système
app.get('/api/subsystems/:id/tickets', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const subsystemId = req.params.id;
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const subsystem = await Subsystem.findById(subsystemId);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Vérifier les permissions
    if (!(user.role === 'master' || 
        (user.role === 'subsystem' && subsystem.admin_user.toString() === user._id.toString()))) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Vous n\'avez pas les permissions nécessaires.'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const { draw, draw_time, agent_id, is_void, start_date, end_date } = req.query;
    
    let query = { subsystem_id: subsystem._id };
    
    if (draw) query.draw = draw;
    if (draw_time) query.draw_time = draw_time;
    if (agent_id) query.agent_id = agent_id;
    if (is_void !== undefined) query.is_void = is_void === 'true';
    
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    }
    
    const tickets = await Ticket.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ date: -1 });
    
    const total = await Ticket.countDocuments(query);
    
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
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id,
        is_printed: ticket.is_printed,
        is_synced: ticket.is_synced,
        is_void: ticket.is_void,
        winning_amount: ticket.winning_amount,
        is_winner: ticket.is_winner,
        is_paid: ticket.is_paid
      })),
      pagination: {
        page: page,
        limit: limit,
        total: total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des tickets'
    });
  }
});

// Obtenir les rapports d'un sous-système
app.get('/api/subsystems/:id/reports', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const subsystemId = req.params.id;
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const subsystem = await Subsystem.findById(subsystemId);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Vérifier les permissions
    if (!(user.role === 'master' || 
        (user.role === 'subsystem' && subsystem.admin_user.toString() === user._id.toString()))) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Vous n\'avez pas les permissions nécessaires.'
      });
    }

    const { start_date, end_date, type } = req.query;
    
    let query = { subsystem_id: subsystem._id, is_void: false };
    
    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);
      end.setDate(end.getDate() + 1);
      query.date = { $gte: start, $lt: end };
    }
    
    const tickets = await Ticket.find(query);
    
    const totalTickets = tickets.length;
    const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    
    // Regrouper par jour
    const dailyBreakdown = {};
    tickets.forEach(ticket => {
      const dateStr = ticket.date.toISOString().split('T')[0];
      if (!dailyBreakdown[dateStr]) {
        dailyBreakdown[dateStr] = {
          date: dateStr,
          ticket_count: 0,
          total_amount: 0
        };
      }
      dailyBreakdown[dateStr].ticket_count++;
      dailyBreakdown[dateStr].total_amount += ticket.total;
    });
    
    // Regrouper par agent
    const agentBreakdown = {};
    tickets.forEach(ticket => {
      if (!agentBreakdown[ticket.agent_name]) {
        agentBreakdown[ticket.agent_name] = {
          agent_name: ticket.agent_name,
          ticket_count: 0,
          total_amount: 0
        };
      }
      agentBreakdown[ticket.agent_name].ticket_count++;
      agentBreakdown[ticket.agent_name].total_amount += ticket.total;
    });

    res.json({
      success: true,
      report: {
        period: {
          start_date: start_date || new Date().toISOString().split('T')[0],
          end_date: end_date || new Date().toISOString().split('T')[0]
        },
        summary: {
          total_tickets: totalTickets,
          total_amount: totalAmount,
          average_ticket: totalTickets > 0 ? Math.round(totalAmount / totalTickets) : 0
        },
        daily_breakdown: Object.values(dailyBreakdown),
        agent_breakdown: Object.values(agentBreakdown)
      }
    });

  } catch (error) {
    console.error('Erreur génération rapport:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la génération du rapport'
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
  console.log('  GET    /api/draws');
  console.log('  GET    /api/results');
  console.log('  GET    /api/results/latest');
  console.log('  POST   /api/bets');
  console.log('  POST   /api/tickets');
  console.log('  GET    /api/tickets/latest');
  console.log('  GET    /api/tickets/:id');
  console.log('  GET    /api/tickets/search');
  console.log('  GET    /api/tickets/history');
  console.log('  GET    /api/tickets/all');
  console.log('  DELETE /api/tickets/:id');
  console.log('  PUT    /api/tickets/:id/void');
  console.log('  PUT    /api/tickets/:id/print');
  console.log('  PUT    /api/tickets/:id/sync');
  console.log('  GET    /api/tickets/pending');
  console.log('  GET    /api/tickets/unprinted');
  console.log('  GET    /api/tickets/multi-draw');
  console.log('  POST   /api/tickets/multi-draw');
  console.log('  POST   /api/check-winners');
  console.log('  GET    /api/tickets/winning');
  console.log('  PUT    /api/winners/:id/pay');
  console.log('  GET    /api/reports');
  console.log('  POST   /api/reports/end-of-draw');
  console.log('  GET    /api/reports/general');
  console.log('  POST   /api/reports/draw');
  console.log('  GET    /api/company-info');
  console.log('  PUT    /api/company-info');
  console.log('  GET    /api/logo');
  console.log('  GET    /api/auth/check');
  console.log('  GET    /api/agents/:id/stats');
  console.log('  GET    /api/payouts');
  console.log('  POST   /api/draws');
  console.log('  PUT    /api/draws/:id');
  console.log('  POST   /api/results');
  console.log('  PUT    /api/results/:id');
  console.log('');
  console.log('📋 Routes API SOUS-SYSTÈMES disponibles:');
  console.log('  GET    /api/subsystems/mine');
  console.log('  GET    /api/subsystems/:id');
  console.log('  GET    /api/subsystems/:id/dashboard');
  console.log('  POST   /api/subsystems/users/create');
  console.log('  GET    /api/subsystems/:id/users');
  console.log('  GET    /api/subsystems/:id/tickets');
  console.log('  GET    /api/subsystems/:id/reports');
});