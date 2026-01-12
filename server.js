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
  is_printed: { type: Boolean, default: false },
  printed_at: { type: Date }
});

const MultiDrawTicket = mongoose.model('MultiDrawTicket', multiDrawTicketSchema);

// Schéma pour l'historique
const historySchema = new mongoose.Schema({
  id: { type: Number, required: true },
  date: { type: String, required: true },
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  bets: [betSchema],
  total: { type: Number, required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_name: { type: String }
});

const History = mongoose.model('History', historySchema);

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
  paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
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

// =================== MIDDLEWARE DE VÉRIFICATION DE TOKEN POUR LOTATO ===================

function vérifierTokenLotato(req, res, next) {
  let token = null;
  
  // 1. Vérifier l'en-tête Authorization Bearer (format LOTATO)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  
  // 2. Vérifier aussi le token dans le corps de la requête (pour compatibilité)
  if (!token && req.body && req.body.token) {
    token = req.body.token;
  }
  
  // 3. Vérifier l'en-tête x-auth-token
  if (!token && req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }
  
  // Log pour débogage uniquement en développement
  if (process.env.NODE_ENV === 'development') {
    console.log(`[LOTATO] Token reçu pour ${req.method} ${req.path}:`, token ? 'Présent' : 'Absent');
  }
  
  if (!token || !token.startsWith('nova_')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Token manquant ou invalide' 
    });
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
    } else {
      return res.status(401).json({ 
        success: false, 
        error: 'Token mal formé' 
      });
    }
  }
  
  next();
}

// =================== ROUTES EXISTANTES (PAS DE MODIFICATION) ===================

// Vos routes existantes restent inchangées
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    console.log('Tentative de connexion:', { username, role });
    
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
        level: user.level
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

// =================== ROUTES API EXISTANTES (PAS DE MODIFICATION) ===================

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

app.get('/api/statistics', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeAgents = await User.countDocuments({ role: 'agent' });
    const activeSupervisors = await User.countDocuments({ role: 'supervisor' });
    const activeSubsystems = await User.countDocuments({ role: 'subsystem' });
    
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

app.get('/api/agents', async (req, res) => {
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

app.get('/api/supervisors', async (req, res) => {
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

app.post('/api/agents/create', async (req, res) => {
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

app.get('/api/activities/recent', async (req, res) => {
    try {
        const activities = [];
        res.json({ success: true, activities });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des activités' });
    }
});

app.get('/api/reports/generate', async (req, res) => {
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

app.post('/api/system/settings', async (req, res) => {
    try {
        res.json({ success: true, message: 'Paramètres sauvegardés avec succès' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors de la sauvegarde des paramètres' });
    }
});

// =================== ROUTES POUR LES SOUS-SYSTÈMES (EXISTANT) ===================

app.post('/api/master/subsystems', async (req, res) => {
  try {
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

app.get('/api/master/subsystems', async (req, res) => {
  try {
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

app.get('/api/master/subsystems/:id', async (req, res) => {
  try {
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

app.put('/api/master/subsystems/:id/deactivate', async (req, res) => {
  try {
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

app.put('/api/master/subsystems/:id/activate', async (req, res) => {
  try {
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

app.get('/api/master/subsystems/stats', async (req, res) => {
  try {
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

app.get('/api/master/consolidated-report', async (req, res) => {
  try {
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

// =================== ROUTES DÉDIÉES UNIQUEMENT À LOTATO ===================
// Ces routes utilisent un middleware spécifique et sont isolées

// Route test pour LOTATO
app.get('/api/lotato/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'LOTATO API en ligne',
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Route pour vérifier l'authentification LOTATO
app.get('/api/lotato/auth/check', vérifierTokenLotato, async (req, res) => {
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
        level: user.level
      }
    });
  } catch (error) {
    console.error('Erreur vérification session LOTATO:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification de la session'
    });
  }
});

// Route pour sauvegarder une fiche LOTATO
app.post('/api/lotato/tickets', vérifierTokenLotato, async (req, res) => {
  try {
    console.log('[LOTATO] Sauvegarde de ticket:', {
      body: req.body,
      tokenInfo: req.tokenInfo
    });
    
    // Accepter les deux formats (camelCase et snake_case)
    const { 
      draw, 
      drawTime,        // camelCase
      draw_time,       // snake_case
      bets, 
      total,
      agentName,
      agentId,
      date
    } = req.body;
    
    // Déterminer les valeurs finales
    const finalDraw = draw;
    const finalDrawTime = drawTime || draw_time;
    const finalAgentName = agentName || 'Agent LOTATO';
    const finalAgentId = agentId || req.tokenInfo.userId;
    
    // Validation
    if (!finalDraw || !finalDrawTime || !bets || bets.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Données incomplètes: draw, drawTime et bets sont requis'
      });
    }
    
    // Chercher l'utilisateur
    const user = await User.findById(finalAgentId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
    
    // Générer un numéro de ticket
    const lastTicket = await Ticket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;
    
    // Calculer le total
    const calculatedTotal = total || bets.reduce((sum, bet) => sum + (bet.amount || 0), 0);
    
    // Format des paris pour MongoDB
    const formattedBets = bets.map(bet => ({
      type: bet.type || 'unknown',
      name: bet.name || 'Sans nom',
      number: bet.number || '',
      amount: bet.amount || 0,
      multiplier: bet.multiplier || 1,
      options: bet.options || null,
      perOptionAmount: bet.perOptionAmount || bet.amount || 0,
      isLotto4: bet.isLotto4 || false,
      isLotto5: bet.isLotto5 || false,
      isAuto: bet.isAuto || false,
      isGroup: bet.isGroup || false,
      details: bet.details || null
    }));
    
    // Créer le ticket
    const ticket = new Ticket({
      number: ticketNumber,
      draw: finalDraw,
      draw_time: finalDrawTime,
      date: date ? new Date(date) : new Date(),
      bets: formattedBets,
      total: calculatedTotal,
      agent_id: finalAgentId,
      agent_name: finalAgentName
    });
    
    await ticket.save();
    
    console.log('[LOTATO] ✅ Ticket sauvegardé avec succès:', ticketNumber);
    
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
      message: 'Ticket LOTATO sauvegardé avec succès'
    });
    
  } catch (error) {
    console.error('[LOTATO] ❌ Erreur sauvegarde ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde du ticket: ' + error.message
    });
  }
});

// Route pour obtenir les tickets LOTATO
app.get('/api/lotato/tickets', vérifierTokenLotato, async (req, res) => {
  try {
    const { limit = 100, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Filtrer par agent si c'est un agent
    let query = {};
    if (req.tokenInfo.role === 'agent') {
      query.agent_id = req.tokenInfo.userId;
    }
    
    const tickets = await Ticket.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ date: -1 });
    
    const total = await Ticket.countDocuments(query);
    
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
        agent_name: ticket.agent_name,
        is_synced: ticket.is_synced
      })),
      nextTicketNumber: nextTicketNumber,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[LOTATO] Erreur chargement tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des tickets'
    });
  }
});

// Route pour obtenir une fiche LOTATO par ID
app.get('/api/lotato/tickets/:id', vérifierTokenLotato, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Fiche non trouvée'
      });
    }
    
    // Vérifier les permissions
    if (req.tokenInfo.role === 'agent' && ticket.agent_id.toString() !== req.tokenInfo.userId) {
      return res.status(403).json({
        success: false,
        error: 'Accès interdit'
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
        agent_name: ticket.agent_name
      }
    });
  } catch (error) {
    console.error('[LOTATO] Erreur récupération fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de la fiche'
    });
  }
});

// Route pour les tickets en attente LOTATO
app.get('/api/lotato/tickets/pending', vérifierTokenLotato, async (req, res) => {
  try {
    let query = { is_synced: false };
    
    if (req.tokenInfo.role === 'agent') {
      query.agent_id = req.tokenInfo.userId;
    }
    
    const tickets = await Ticket.find(query)
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
    console.error('[LOTATO] Erreur tickets en attente:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des tickets en attente'
    });
  }
});

// Route pour les résultats LOTATO
app.get('/api/lotato/results', vérifierTokenLotato, async (req, res) => {
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
    console.error('[LOTATO] Erreur chargement résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des résultats'
    });
  }
});

// Route pour les derniers résultats LOTATO
app.get('/api/lotato/results/latest', vérifierTokenLotato, async (req, res) => {
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
    console.error('[LOTATO] Erreur chargement derniers résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des derniers résultats'
    });
  }
});

// Route pour vérifier les gagnants LOTATO
app.post('/api/lotato/check-winners', vérifierTokenLotato, async (req, res) => {
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
    let query = {
      draw: draw,
      draw_time: draw_time,
      date: { 
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lt: new Date(new Date().setHours(23, 59, 59, 999))
      }
    };
    
    // Si c'est un agent, ne chercher que dans ses tickets
    if (req.tokenInfo.role === 'agent') {
      query.agent_id = req.tokenInfo.userId;
    }
    
    const tickets = await Ticket.find(query);
    
    const winningTickets = [];
    
    // Fonction pour vérifier un pari
    const checkBetAgainstResult = (bet, result) => {
      const lot1 = result.lot1;
      const lot2 = result.lot2 || '';
      const lot3 = result.lot3 || '';
      const lot1Last2 = lot1.substring(1);
      
      let isWinner = false;
      let winAmount = 0;
      let winType = '';
      let matchedNumber = '';
      
      switch(bet.type) {
        case 'borlette':
        case 'boulpe':
          if (bet.number === lot1Last2) {
            isWinner = true;
            winAmount = bet.amount * 60;
            winType = '1er lot';
            matchedNumber = lot1Last2;
          } else if (bet.number === lot2) {
            isWinner = true;
            winAmount = bet.amount * 20;
            winType = '2e lot';
            matchedNumber = lot2;
          } else if (bet.number === lot3) {
            isWinner = true;
            winAmount = bet.amount * 10;
            winType = '3e lot';
            matchedNumber = lot3;
          }
          break;
          
        case 'lotto3':
          if (bet.number === lot1) {
            isWinner = true;
            winAmount = bet.amount * 500;
            winType = 'Lotto 3';
            matchedNumber = lot1;
          }
          break;
          
        case 'marriage':
        case 'auto-marriage':
          const [num1, num2] = bet.number.split('*');
          const numbers = [lot1Last2, lot2, lot3];
          
          if (numbers.includes(num1) && numbers.includes(num2)) {
            isWinner = true;
            winAmount = bet.amount * 1000;
            winType = 'Maryaj';
            matchedNumber = `${num1}*${num2}`;
          }
          break;
          
        case 'grap':
          if (lot1[0] === lot1[1] && lot1[1] === lot1[2]) {
            if (bet.number === lot1) {
              isWinner = true;
              winAmount = bet.amount * 500;
              winType = 'Grap';
              matchedNumber = lot1;
            }
          }
          break;
      }
      
      return {
        isWinner,
        winAmount,
        winType,
        matchedNumber
      };
    };
    
    // Vérifier chaque ticket
    for (const ticket of tickets) {
      const winningBets = [];
      let totalWinnings = 0;
      
      for (const bet of ticket.bets) {
        const winningInfo = checkBetAgainstResult(bet, result);
        
        if (winningInfo.isWinner) {
          winningBets.push({
            ...bet.toObject(),
            winAmount: winningInfo.winAmount,
            winType: winningInfo.winType,
            matchedNumber: winningInfo.matchedNumber
          });
          totalWinnings += winningInfo.winAmount;
        }
      }
      
      if (winningBets.length > 0) {
        winningTickets.push({
          ...ticket.toObject(),
          winningBets: winningBets,
          totalWinnings: totalWinnings,
          result: {
            lot1: result.lot1,
            lot2: result.lot2,
            lot3: result.lot3
          }
        });
      }
    }
    
    res.json({
      success: true,
      winningTickets: winningTickets
    });
  } catch (error) {
    console.error('[LOTATO] Erreur vérification gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification des gagnants'
    });
  }
});

// Route pour les tickets gagnants LOTATO
app.get('/api/lotato/tickets/winning', vérifierTokenLotato, async (req, res) => {
  try {
    let query = {};
    
    if (req.tokenInfo.role === 'agent') {
      const agentTickets = await Ticket.find({ agent_id: req.tokenInfo.userId });
      const ticketIds = agentTickets.map(t => t._id);
      query.ticket_id = { $in: ticketIds };
    }
    
    const winners = await Winner.find(query)
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
    console.error('[LOTATO] Erreur chargement gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des gagnants'
    });
  }
});

// Route pour les fiches multi-tirages LOTATO
app.get('/api/lotato/tickets/multi-draw', vérifierTokenLotato, async (req, res) => {
  try {
    let query = {};
    
    if (req.tokenInfo.role === 'agent') {
      query.agent_id = req.tokenInfo.userId;
    }
    
    const tickets = await MultiDrawTicket.find(query)
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
    console.error('[LOTATO] Erreur fiches multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des fiches multi-tirages'
    });
  }
});

// Route pour sauvegarder une fiche multi-tirages LOTATO
app.post('/api/lotato/tickets/multi-draw', vérifierTokenLotato, async (req, res) => {
  try {
    console.log('[LOTATO] Sauvegarde fiche multi-tirages:', req.body);
    
    const { ticket, agentId, agentName } = req.body;
    
    // Vérifier si l'utilisateur existe
    const user = await User.findById(agentId || req.tokenInfo.userId);
    if (!user) {
      return res.status(404).json({
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
      draws: Array.from(ticket.draws || []),
      total: ticket.totalAmount || ticket.total || 0,
      agent_id: agentId || req.tokenInfo.userId,
      agent_name: agentName || user.name
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
    console.error('[LOTATO] Erreur sauvegarde fiche multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde de la fiche multi-tirages'
    });
  }
});

// Route pour les informations de l'entreprise LOTATO
app.get('/api/lotato/company-info', vérifierTokenLotato, async (req, res) => {
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
    console.error('[LOTATO] Erreur chargement info entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des informations de l\'entreprise'
    });
  }
});

// Route pour le logo LOTATO
app.get('/api/lotato/logo', vérifierTokenLotato, async (req, res) => {
  try {
    const config = await Config.findOne();
    
    res.json({
      success: true,
      logoUrl: config ? config.logo_url : 'logo-borlette.jpg'
    });
  } catch (error) {
    console.error('[LOTATO] Erreur chargement logo:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du logo'
    });
  }
});

// Route pour l'historique LOTATO
app.get('/api/lotato/history', vérifierTokenLotato, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    let query = {};
    
    if (req.tokenInfo.role === 'agent') {
      query.agent_id = req.tokenInfo.userId;
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
        agent_name: ticket.agent_name
      })),
      pagination: {
        page: page,
        limit: limit,
        total: total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[LOTATO] Erreur historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement de l\'historique'
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
    
    // Initialiser les tirages par défaut
    const defaultDraws = [
      { name: 'Miami', code: 'miami', times: { morning: '1:30 PM', evening: '9:50 PM' }, order: 1 },
      { name: 'Georgia', code: 'georgia', times: { morning: '12:30 PM', evening: '7:00 PM' }, order: 2 },
      { name: 'New York', code: 'newyork', times: { morning: '2:30 PM', evening: '8:00 PM' }, order: 3 },
      { name: 'Texas', code: 'texas', times: { morning: '12:00 PM', evening: '6:00 PM' }, order: 4 },
      { name: 'Tunisie', code: 'tunisia', times: { morning: '10:30 AM', evening: '2:00 PM' }, order: 5 }
    ];
    
    for (const drawData of defaultDraws) {
      const existingDraw = await Draw.findOne({ code: drawData.code });
      if (!existingDraw) {
        const draw = new Draw(drawData);
        await draw.save();
      }
    }
    
    // Initialiser la configuration
    const existingConfig = await Config.findOne();
    if (!existingConfig) {
      const config = new Config();
      await config.save();
    }
    
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
  console.log('');
  console.log('🎰 LOTATO API Routes (isolées):');
  console.log('  GET    /api/lotato/health');
  console.log('  GET    /api/lotato/auth/check');
  console.log('  POST   /api/lotato/tickets');
  console.log('  GET    /api/lotato/tickets');
  console.log('  GET    /api/lotato/tickets/:id');
  console.log('  GET    /api/lotato/tickets/pending');
  console.log('  GET    /api/lotato/results');
  console.log('  GET    /api/lotato/results/latest');
  console.log('  POST   /api/lotato/check-winners');
  console.log('  GET    /api/lotato/tickets/winning');
  console.log('  GET    /api/lotato/tickets/multi-draw');
  console.log('  POST   /api/lotato/tickets/multi-draw');
  console.log('  GET    /api/lotato/company-info');
  console.log('  GET    /api/lotato/logo');
  console.log('  GET    /api/lotato/history');
  console.log('');
  console.log('👑 Routes existantes (non modifiées):');
  console.log('  POST   /api/auth/login');
  console.log('  GET    /api/health');
  console.log('  GET    /api/statistics');
  console.log('  GET    /api/agents');
  console.log('  GET    /api/supervisors');
  console.log('  POST   /api/agents/create');
  console.log('  POST   /api/master/subsystems');
  console.log('  GET    /api/master/subsystems');
  console.log('');
  console.log('📊 Pages disponibles:');
  console.log(`  👑 Master Dashboard: http://localhost:${PORT}/master-dashboard.html`);
  console.log(`  🏢 Subsystem Admin: http://localhost:${PORT}/subsystem-admin.html`);
  console.log(`  🎰 LOTATO: http://localhost:${PORT}/lotato.html`);
  console.log(`  👮 Control Level 1: http://localhost:${PORT}/control-level1.html`);
  console.log(`  👮 Control Level 2: http://localhost:${PORT}/control-level2.html`);
  console.log(`  📊 Supervisor Control: http://localhost:${PORT}/supervisor-control.html`);
  console.log(`  🏠 Login: http://localhost:${PORT}/`);
  console.log('');
  console.log('✅ Serveur prêt avec routes LOTATO isolées !');
});