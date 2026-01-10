const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const fs = require('fs');

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

// =================== SCHÉMAS SIMPLES (comme dans le fichier minimal) ===================

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

// =================== SCHÉMAS POUR LES SOUS-SYSTÈMES ===================

// Schéma pour les sous-systèmes
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

// =================== ROUTE DE CONNEXION SIMPLE (comme dans le fichier minimal) ===================

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

    // Générer un token simplifié temporaire
    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;

    // Déterminer la redirection en fonction du rôle et niveau (comme dans le fichier minimal)
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

    // Ajouter le token à l'URL de redirection
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

// =================== MIDDLEWARE DE VÉRIFICATION DE TOKEN SIMPLE ===================

function vérifierToken(req, res, next) {
  // Vérifier d'abord dans les query params
  let token = req.query.token;
  
  // Si pas dans query, vérifier dans le body
  if (!token && req.body) {
    token = req.body.token;
  }
  
  // Si pas dans body, vérifier dans les headers
  if (!token) {
    token = req.headers['x-auth-token'];
  }
  
  if (!token || !token.startsWith('nova_')) {
    // Pour les routes API, retourner une erreur JSON
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token manquant ou invalide' 
      });
    }
    // Pour les routes HTML, laisser passer (on vérifiera côté client)
    // On ne redirige pas automatiquement pour permettre l'accès aux pages
  }
  
  // Si on a un token, extraire les informations
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

// =================== ROUTES API SIMPLES ===================

// Endpoint de santé (pas besoin de token)
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Route pour vérifier la validité d'un token
app.get('/api/auth/verify', (req, res) => {
  try {
    const token = req.query.token;
    
    if (!token || !token.startsWith('nova_')) {
      return res.json({
        success: false,
        valid: false
      });
    }
    
    // Le token est valide (vérification basique)
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

// Route pour les statistiques générales
app.get('/api/statistics', vérifierToken, async (req, res) => {
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

// Route pour les agents
app.get('/api/agents', vérifierToken, async (req, res) => {
  try {
    const agents = await User.find({ 
      role: 'agent'
    }).select('-password');
    
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
    const supervisors = await User.find({ 
      role: 'supervisor'
    }).select('-password');
    
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

// Route pour créer un agent
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

// Route pour les activités récentes
app.get('/api/activities/recent', vérifierToken, async (req, res) => {
    try {
        const activities = []; // À adapter selon votre modèle
        res.json({ success: true, activities });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des activités' });
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
            activeAgents: await User.countDocuments({ role: 'agent' }),
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

// =================== ROUTES POUR LES SOUS-SYSTÈMES ===================

// Créer un sous-système
app.post('/api/master/subsystems', vérifierToken, async (req, res) => {
  try {
    // Vérifier que l'utilisateur est un master
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

    // Validation
    if (!name || !subdomain || !contact_email) {
      return res.status(400).json({
        success: false,
        error: 'Le nom, le sous-domaine et l\'email de contact sont obligatoires'
      });
    }

    // Vérifier que le sous-domaine est unique
    const existingSubsystem = await Subsystem.findOne({ subdomain: subdomain });
    if (existingSubsystem) {
      return res.status(400).json({
        success: false,
        error: 'Ce sous-domaine est déjà utilisé'
      });
    }

    // Vérifier si l'utilisateur admin existe déjà
    let adminUser = await User.findOne({ username: contact_email });
    
    if (!adminUser) {
      // Générer un mot de passe aléatoire pour l'admin
      const generatedPassword = Math.random().toString(36).slice(-8);

      // Créer l'utilisateur admin pour le sous-système
      adminUser = new User({
        username: contact_email,
        password: generatedPassword,
        name: name,
        role: 'subsystem',
        level: 1
      });

      await adminUser.save();
    } else {
      // Si l'utilisateur existe déjà, vérifier qu'il a le bon rôle
      if (adminUser.role !== 'subsystem') {
        return res.status(400).json({
          success: false,
          error: 'Cet email est déjà utilisé avec un rôle différent'
        });
      }
    }

    // Calculer la date d'expiration
    const subscription_expires = new Date();
    subscription_expires.setMonth(subscription_expires.getMonth() + (subscription_months || 1));

    // Créer le sous-système
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

    // Construire l'URL d'accès
    const domain = process.env.DOMAIN || req.headers.host?.replace('master.', '') || 'novalotto.com';
    const access_url = `https://${subdomain}.${domain}`;

    // Répondre avec les identifiants
    res.json({
      success: true,
      subsystem: {
        id: subsystem._id,
        ...subsystem.toObject()
      },
      admin_credentials: {
        username: contact_email,
        password: adminUser.password, // Utiliser le mot de passe existant ou généré
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

// Lister tous les sous-systèmes
app.get('/api/master/subsystems', vérifierToken, async (req, res) => {
  try {
    // Vérifier que l'utilisateur est un master
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    // Récupérer les paramètres de requête
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search;
    const status = req.query.status;

    // Construire la requête
    let query = {};

    // Filtre par recherche
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { subdomain: { $regex: search, $options: 'i' } },
        { contact_email: { $regex: search, $options: 'i' } }
      ];
    }

    // Filtre par statut
    if (status && status !== 'all') {
      if (status === 'active') {
        query.is_active = true;
      } else if (status === 'inactive') {
        query.is_active = false;
      } else if (status === 'expired') {
        query.subscription_expires = { $lt: new Date() };
      }
    }

    // Compter le total
    const total = await Subsystem.countDocuments(query);

    // Calculer la pagination
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    // Exécuter la requête
    const subsystems = await Subsystem.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });

    // Formater la réponse
    const formattedSubsystems = subsystems.map(subsystem => {
      // Calculer le pourcentage d'utilisation (simulation)
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

// Récupérer un sous-système par ID
app.get('/api/master/subsystems/:id', vérifierToken, async (req, res) => {
  try {
    // Vérifier que l'utilisateur est un master
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

    // Simuler des utilisateurs
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

// Désactiver un sous-système
app.put('/api/master/subsystems/:id/deactivate', vérifierToken, async (req, res) => {
  try {
    // Vérifier que l'utilisateur est un master
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

// Activer un sous-système
app.put('/api/master/subsystems/:id/activate', vérifierToken, async (req, res) => {
  try {
    // Vérifier que l'utilisateur est un master
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

// Statistiques des sous-systèmes
app.get('/api/master/subsystems/stats', vérifierToken, async (req, res) => {
  try {
    // Vérifier que l'utilisateur est un master
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

// Rapport consolidé
app.get('/api/master/consolidated-report', vérifierToken, async (req, res) => {
  try {
    // Vérifier que l'utilisateur est un master
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const { start_date, end_date, group_by } = req.query;

    // Simuler un rapport
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

// =================== ROUTES HTML SIMPLES (comme dans le fichier minimal) ===================

// 1. Page principale (login)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Toutes les autres pages HTML - vérification simple du token
app.get('/*.html', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  
  // Vérifier si le fichier existe
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send('Page non trouvée');
    }
    
    // Envoyer le fichier (la vérification du token se fera côté client)
    res.sendFile(filePath);
  });
});

// Routes spécifiques pour les pages principales
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

// =================== ROUTES POUR INITIALISER LA BASE DE DONNÉES ===================

// Route pour créer un utilisateur master (si nécessaire)
app.post('/api/init/master', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    
    // Vérifier si un master existe déjà
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

// Route pour créer un utilisateur subsystem (si nécessaire)
app.post('/api/init/subsystem', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    
    // Vérifier si l'utilisateur existe déjà
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

// Middleware 404 pour les routes non trouvées
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
  console.log('📋 Routes API disponibles:');
  console.log('  POST /api/auth/login');
  console.log('  GET  /api/health');
  console.log('  POST /api/master/subsystems');
  console.log('  GET  /api/master/subsystems');
  console.log('  GET  /api/master/subsystems/:id');
  console.log('  PUT  /api/master/subsystems/:id/deactivate');
  console.log('  PUT  /api/master/subsystems/:id/activate');
  console.log('  GET  /api/master/subsystems/stats');
  console.log('  GET  /api/master/consolidated-report');
  console.log('  GET  /api/statistics');
  console.log('  GET  /api/agents');
  console.log('  GET  /api/supervisors');
  console.log('  POST /api/agents/create');
  console.log('  POST /api/init/master');
  console.log('  POST /api/init/subsystem');
});