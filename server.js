
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');

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

// Middleware standard
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve tous les fichiers statiques à la racine avec compression GZIP
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
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

// =================== SCHÉMAS MONGOOSE ===================

// Schema utilisateur principal
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  full_name: { type: String },
  email: { type: String },
  phone: { type: String },
  role: {
    type: String,
    enum: ['master', 'subsystem_owner', 'subsystem_admin', 'supervisor', 'agent'],
    default: 'agent'
  },
  level: { type: Number, default: 1 },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  is_active: { type: Boolean, default: true },
  last_login: { type: Date },
  created_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Schema sous-système
const subsystemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subdomain: { type: String, required: true, unique: true },
  contact_email: { type: String, required: true },
  contact_phone: { type: String },
  company_name: { type: String },
  address: { type: String },
  max_users: { type: Number, default: 10 },
  subscription_type: { 
    type: String, 
    enum: ['basic', 'standard', 'premium', 'enterprise'],
    default: 'standard'
  },
  subscription_months: { type: Number, default: 1 },
  subscription_expires: { type: Date },
  is_active: { type: Boolean, default: true },
  settings: {
    allowed_games: { type: [String], default: ['borlette', 'lotto3', 'lotto4', 'lotto5', 'grap', 'marriage'] },
    opening_time: { type: String, default: '08:00' },
    closing_time: { type: String, default: '22:00' },
    enable_schedule: { type: Boolean, default: true },
    ticket_limit: { type: Number, default: 1000 }
  },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now }
});

const Subsystem = mongoose.model('Subsystem', subsystemSchema);

// Schema pour les tirages
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

// Schema pour les types de paris
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

// Schema pour les résultats
const resultSchema = new mongoose.Schema({
  drawId: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, enum: ['morning', 'evening'], required: true },
  lot1: { type: String, required: true },
  lot2: { type: String },
  lot3: { type: String }
});

const Result = mongoose.model('Result', resultSchema);

// Schema pour les fiches (tickets)
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

// =================== MIDDLEWARE D'AUTHENTIFICATION ===================

// Middleware de vérification de token (pour API seulement)
function vérifierToken(req, res, next) {
  const { token } = req.query;
  if (!token || !token.startsWith('nova_')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Token manquant ou invalide' 
    });
  }
  next();
}

// =================== ROUTES D'AUTHENTIFICATION (ORIGINALES) ===================

// Route de connexion originale (NE PAS MODIFIER)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const user = await User.findOne({ 
      username,
      password,
      role
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
      case 'subsystem_owner':
      case 'subsystem_admin':
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

// =================== NOUVELLES ROUTES POUR MASTER DASHBOARD ===================

// Route pour l'initialisation du master
app.post('/api/master/init', async (req, res) => {
  try {
    const { masterUsername, masterPassword, companyName, masterEmail } = req.body;
    
    // Vérifier s'il existe déjà un master
    const existingMaster = await User.findOne({ username: masterUsername, role: 'master' });
    if (existingMaster) {
      return res.status(400).json({
        success: false,
        error: 'Un compte master existe déjà'
      });
    }
    
    // Créer le master
    const master = new User({
      username: masterUsername,
      password: masterPassword,
      full_name: 'Master Admin',
      email: masterEmail,
      role: 'master',
      level: 1,
      is_active: true
    });
    
    await master.save();
    
    // Générer un token
    const token = `nova_${Date.now()}_${master._id}_master_1`;
    
    res.json({
      success: true,
      token: token,
      user: {
        id: master._id,
        username: master.username,
        full_name: master.full_name,
        email: master.email,
        role: master.role,
        level: master.level
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'initialisation du master'
    });
  }
});

// Route pour la connexion master
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
        error: 'Identifiants incorrects'
      });
    }
    
    // Mettre à jour la dernière connexion
    user.last_login = new Date();
    await user.save();
    
    // Générer un token
    const token = `nova_${Date.now()}_${user._id}_master_${user.level}`;
    
    res.json({
      success: true,
      token: token,
      user: {
        id: user._id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        level: user.level
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la connexion'
    });
  }
});

// Route pour obtenir la liste des sous-systèmes
app.get('/api/master/subsystems', vérifierToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const skip = (page - 1) * limit;
    
    let query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { subdomain: { $regex: search, $options: 'i' } },
        { contact_email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status === 'active') {
      query.is_active = true;
    } else if (status === 'inactive') {
      query.is_active = false;
    } else if (status === 'expired') {
      query.subscription_expires = { $lt: new Date() };
    }
    
    const total = await Subsystem.countDocuments(query);
    const subsystems = await Subsystem.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ created_at: -1 });
    
    // Pour chaque sous-système, compter le nombre d'utilisateurs
    const subsystemsWithStats = await Promise.all(subsystems.map(async (subsystem) => {
      const userCount = await User.countDocuments({ 
        subsystem_id: subsystem._id
      });
      
      return {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        contact_email: subsystem.contact_email,
        contact_phone: subsystem.contact_phone,
        is_active: subsystem.is_active,
        subscription_type: subsystem.subscription_type,
        subscription_expires: subsystem.subscription_expires,
        max_users: subsystem.max_users,
        created_at: subsystem.created_at,
        stats: {
          active_users: userCount,
          usage_percentage: subsystem.max_users > 0 ? Math.round((userCount / subsystem.max_users) * 100) : 0,
          today_tickets: Math.floor(Math.random() * 200) + 50,
          today_sales: Math.floor(Math.random() * 100000) + 50000
        }
      };
    }));
    
    res.json({
      success: true,
      subsystems: subsystemsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des sous-systèmes'
    });
  }
});

// Route pour obtenir les détails d'un sous-système
app.get('/api/master/subsystems/:id', vérifierToken, async (req, res) => {
  try {
    const subsystem = await Subsystem.findById(req.params.id);
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }
    
    // Récupérer les utilisateurs du sous-système
    const users = await User.find({ 
      subsystem_id: subsystem._id
    }).select('-password');
    
    // Compter les utilisateurs par rôle
    const usersByRole = {
      owner: 0,
      admin: 0,
      supervisor: 0,
      agent: 0
    };
    
    users.forEach(user => {
      if (user.role === 'subsystem_owner') usersByRole.owner++;
      else if (user.role === 'subsystem_admin') usersByRole.admin++;
      else if (user.role === 'supervisor') usersByRole.supervisor++;
      else if (user.role === 'agent') usersByRole.agent++;
    });
    
    // Statistiques simulées
    const stats = {
      today_sales: Math.floor(Math.random() * 100000) + 50000,
      today_tickets: Math.floor(Math.random() * 200) + 50,
      active_users: users.length,
      usage_percentage: subsystem.max_users > 0 ? Math.round((users.length / subsystem.max_users) * 100) : 0
    };
    
    res.json({
      success: true,
      subsystem: {
        ...subsystem.toObject(),
        users: users,
        stats: stats,
        users_by_role: usersByRole
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du sous-système'
    });
  }
});

// Route pour créer un sous-système
app.post('/api/master/subsystems', vérifierToken, async (req, res) => {
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
    
    // Vérifier si le sous-domaine est déjà utilisé
    const existingSubsystem = await Subsystem.findOne({ subdomain });
    if (existingSubsystem) {
      return res.status(400).json({
        success: false,
        error: 'Ce sous-domaine est déjà utilisé'
      });
    }
    
    // Calculer la date d'expiration
    const subscription_expires = new Date();
    subscription_expires.setMonth(subscription_expires.getMonth() + (subscription_months || 1));
    
    // Créer le sous-système
    const subsystem = new Subsystem({
      name,
      subdomain,
      contact_email,
      contact_phone,
      max_users: max_users || 10,
      subscription_type: subscription_type || 'standard',
      subscription_months: subscription_months || 1,
      subscription_expires,
      is_active: true
    });
    
    await subsystem.save();
    
    // Créer un utilisateur admin pour ce sous-système
    const adminUsername = `${subdomain}_admin`;
    const adminPassword = Math.random().toString(36).slice(-8); // Mot de passe aléatoire
    
    const adminUser = new User({
      username: adminUsername,
      password: adminPassword,
      full_name: `Admin ${name}`,
      email: contact_email,
      role: 'subsystem_admin',
      subsystem_id: subsystem._id,
      is_active: true
    });
    
    await adminUser.save();
    
    res.json({
      success: true,
      message: 'Sous-système créé avec succès',
      subsystem: {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain
      },
      admin_credentials: {
        username: adminUsername,
        password: adminPassword,
        email: contact_email
      },
      access_url: `${subdomain}.novalotto.com`
    });
  } catch (error) {
    console.error('Erreur création sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du sous-système'
    });
  }
});

// Route pour désactiver un sous-système
app.put('/api/master/subsystems/:id/deactivate', vérifierToken, async (req, res) => {
  try {
    const subsystem = await Subsystem.findById(req.params.id);
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
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la désactivation du sous-système'
    });
  }
});

// Route pour activer un sous-système
app.put('/api/master/subsystems/:id/activate', vérifierToken, async (req, res) => {
  try {
    const subsystem = await Subsystem.findById(req.params.id);
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
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'activation du sous-système'
    });
  }
});

// Route pour les statistiques des sous-systèmes
app.get('/api/master/subsystems/stats', vérifierToken, async (req, res) => {
  try {
    const subsystems = await Subsystem.find();
    
    const stats = await Promise.all(subsystems.map(async (subsystem) => {
      const userCount = await User.countDocuments({ 
        subsystem_id: subsystem._id
      });
      
      // Statistiques simulées
      const total_sales = Math.floor(Math.random() * 1000000) + 500000;
      const total_payout = Math.floor(total_sales * 0.7);
      const profit = total_sales - total_payout;
      
      return {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        active_agents: Math.floor(Math.random() * 20) + 5,
        total_sales: total_sales,
        total_payout: total_payout,
        profit: profit
      };
    }));
    
    res.json({
      success: true,
      subsystems: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des statistiques'
    });
  }
});

// Route pour le rapport consolidé
app.get('/api/master/consolidated-report', vérifierToken, async (req, res) => {
  try {
    const { start_date, end_date, group_by = 'day' } = req.query;
    
    // Simuler des données de rapport
    const subsystems = await Subsystem.find().limit(5);
    
    const report = {
      period: {
        start_date: start_date,
        end_date: end_date
      },
      total_subsystems: await Subsystem.countDocuments(),
      summary: {
        total_tickets: Math.floor(Math.random() * 10000) + 5000,
        total_sales: Math.floor(Math.random() * 10000000) + 5000000,
        total_payout: Math.floor(Math.random() * 7000000) + 3000000,
        total_profit: Math.floor(Math.random() * 3000000) + 1000000
      },
      subsystems_detail: [],
      daily_breakdown: []
    };
    
    // Ajouter des sous-systèmes fictifs
    for (let subsystem of subsystems) {
      const total_sales = Math.floor(Math.random() * 2000000) + 500000;
      const total_payout = Math.floor(total_sales * 0.7);
      const profit = total_sales - total_payout;
      
      report.subsystems_detail.push({
        subsystem_id: subsystem._id,
        subsystem_name: subsystem.name,
        tickets_count: Math.floor(Math.random() * 1000) + 200,
        total_sales: total_sales,
        total_payout: total_payout,
        profit: profit
      });
    }
    
    // Ajouter des données quotidiennes
    const start = new Date(start_date);
    const end = new Date(end_date);
    let currentDate = new Date(start);
    
    while (currentDate <= end) {
      report.daily_breakdown.push({
        date: currentDate.toISOString().split('T')[0],
        ticket_count: Math.floor(Math.random() * 300) + 100,
        total_amount: Math.floor(Math.random() * 300000) + 100000
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    res.json({
      success: true,
      report: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la génération du rapport'
    });
  }
});

// =================== ROUTES POUR SUBSYSTEM ADMIN ===================

// Route pour le dashboard du sous-système
app.get('/api/subsystem/dashboard', vérifierToken, async (req, res) => {
  try {
    const token = req.query.token;
    const parts = token.split('_');
    const userId = parts[2];
    
    const user = await User.findById(userId);
    if (!user || !user.subsystem_id) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur ou sous-système non trouvé'
      });
    }
    
    const subsystem = await Subsystem.findById(user.subsystem_id);
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }
    
    // Compter les utilisateurs du sous-système
    const userCount = await User.countDocuments({ 
      subsystem_id: subsystem._id
    });
    
    // Statistiques simulées
    const stats = {
      online_users: Math.floor(Math.random() * 20) + 5,
      today_sales: Math.floor(Math.random() * 100000) + 50000,
      today_tickets: Math.floor(Math.random() * 200) + 50,
      pending_alerts: Math.floor(Math.random() * 10),
      total_sales: Math.floor(Math.random() * 1000000) + 500000,
      total_users: userCount,
      max_users: subsystem.max_users,
      total_tickets: Math.floor(Math.random() * 5000) + 1000,
      estimated_profit: Math.floor(Math.random() * 200000) + 50000
    };
    
    res.json({
      success: true,
      subsystem: {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        max_users: subsystem.max_users
      },
      stats: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du dashboard'
    });
  }
});

// Route pour les utilisateurs du sous-système
app.get('/api/subsystem/users', vérifierToken, async (req, res) => {
  try {
    const token = req.query.token;
    const parts = token.split('_');
    const userId = parts[2];
    
    const user = await User.findById(userId);
    if (!user || !user.subsystem_id) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur ou sous-système non trouvé'
      });
    }
    
    // Récupérer les utilisateurs du même sous-système
    const users = await User.find({ 
      subsystem_id: user.subsystem_id
    }).select('-password');
    
    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des utilisateurs'
    });
  }
});

// =================== ROUTES PARTAGÉES ===================

// Route pour les statistiques générales
app.get('/api/statistics', vérifierToken, async (req, res) => {
  try {
    const token = req.query.token;
    const parts = token.split('_');
    const role = parts[3];
    
    let statistics = {};
    
    if (role === 'master') {
      // Statistiques pour le master
      const totalSubsystems = await Subsystem.countDocuments();
      const totalUsers = await User.countDocuments();
      const activeAgents = await User.countDocuments({ role: 'agent', is_active: true });
      const activeSupervisors = await User.countDocuments({ role: 'supervisor', is_active: true });
      
      statistics = {
        active_agents: activeAgents,
        active_supervisors: activeSupervisors,
        total_sales: Math.floor(Math.random() * 10000000) + 5000000,
        total_profit: Math.floor(Math.random() * 3000000) + 1000000,
        total_subsystems: totalSubsystems,
        total_users: totalUsers
      };
    } else {
      // Statistiques pour le sous-système
      const userId = parts[2];
      const user = await User.findById(userId);
      
      if (user && user.subsystem_id) {
        const userCount = await User.countDocuments({ 
          subsystem_id: user.subsystem_id
        });
        
        statistics = {
          active_agents: await User.countDocuments({ 
            subsystem_id: user.subsystem_id, 
            role: 'agent', 
            is_active: true 
          }),
          active_supervisors: await User.countDocuments({ 
            subsystem_id: user.subsystem_id, 
            role: 'supervisor', 
            is_active: true 
          }),
          total_sales: Math.floor(Math.random() * 1000000) + 500000,
          total_profit: Math.floor(Math.random() * 200000) + 50000,
          total_users: userCount
        };
      }
    }
    
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

// Route pour les agents
app.get('/api/agents', vérifierToken, async (req, res) => {
  try {
    const token = req.query.token;
    const parts = token.split('_');
    const role = parts[3];
    const userId = parts[2];
    
    let agents = [];
    
    if (role === 'master') {
      // Le master voit tous les agents
      agents = await User.find({ 
        role: 'agent',
        is_active: true
      }).select('-password');
    } else {
      // Un utilisateur de sous-système ne voit que les agents de son sous-système
      const user = await User.findById(userId);
      if (user && user.subsystem_id) {
        agents = await User.find({ 
          role: 'agent',
          subsystem_id: user.subsystem_id,
          is_active: true
        }).select('-password');
      }
    }
    
    // Ajouter des statistiques simulées pour chaque agent
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

// Route pour les superviseurs
app.get('/api/supervisors', vérifierToken, async (req, res) => {
  try {
    const token = req.query.token;
    const parts = token.split('_');
    const role = parts[3];
    const userId = parts[2];
    
    let supervisors = [];
    
    if (role === 'master') {
      supervisors = await User.find({ 
        role: 'supervisor',
        is_active: true
      }).select('-password');
    } else {
      const user = await User.findById(userId);
      if (user && user.subsystem_id) {
        supervisors = await User.find({ 
          role: 'supervisor',
          subsystem_id: user.subsystem_id,
          is_active: true
        }).select('-password');
      }
    }
    
    // Ajouter des statistiques simulées
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

// =================== ROUTES ORIGINALES LOTATO (NE PAS MODIFIER) ===================

// Endpoint de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Endpoint pour les tirages
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

// Endpoint pour les types de paris
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

// =================== ROUTES HTML ORIGINALES (NE PAS MODIFIER) ===================

// Route pour la page principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour le master dashboard (ORIGINALE)
app.get('/master-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

// Route pour le subsystem admin (ORIGINALE)
const fs = require('fs');
app.get('/subsystem-admin.html', (req, res) => {
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

// Route pour le lotato (ORIGINALE)
app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Route pour le control level 1 (ORIGINALE)
app.get('/control-level1.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level1.html'));
});

// Route pour le control level 2 (ORIGINALE)
app.get('/control-level2.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level2.html'));
});

// Route pour le supervisor control (ORIGINALE)
app.get('/supervisor-control.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor-control.html'));
});

// =================== DÉMARRAGE DU SERVEUR ===================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📁 Compression GZIP activée`);
  console.log(`👑 Master Dashboard: http://localhost:${PORT}/master-dashboard.html`);
  console.log(`🏢 Subsystem Admin: http://localhost:${PORT}/subsystem-admin.html`);
  console.log(`🎰 LOTATO: http://localhost:${PORT}/lotato.html`);
});