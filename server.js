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

// =================== MIDDLEWARE POUR L'ACCÈS AUX SOUS-SYSTÈMES ===================

// Middleware pour vérifier l'accès aux routes sous-système
async function vérifierAccèsSubsystem(req, res, next) {
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

    // Autoriser les administrateurs de sous-systèmes ET les superviseurs niveau 2
    if (user.role === 'subsystem' || (user.role === 'supervisor' && user.level === 2)) {
      req.currentUser = user;
      next();
    } else {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle subsystem ou superviseur level 2 requis.'
      });
    }
  } catch (error) {
    console.error('Erreur vérification accès sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la vérification des droits d\'accès'
    });
  }
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
    
    // Gérer les rôles spéciaux pour les superviseurs
    let dbRole = role;
    let level = 1;
    
    if (role === 'supervisor1') {
      dbRole = 'supervisor';
      level = 1;
    } else if (role === 'supervisor2') {
      dbRole = 'supervisor';
      level = 2;
    }
    
    // Recherche de l'utilisateur avec le rôle approprié
    let query = {
      username,
      password,
      role: dbRole
    };
    
    // Ajouter la condition de niveau pour les superviseurs
    if (dbRole === 'supervisor') {
      query.level = level;
    }
    
    const user = await User.findOne(query);

    if (!user) {
      console.log('Utilisateur non trouvé ou informations incorrectes');
      return res.status(401).json({
        success: false,
        error: 'Identifiants ou rôle incorrect'
      });
    }

    console.log('Utilisateur trouvé:', user.username, user.role, user.level);

    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;

    let redirectUrl;
    switch (user.role) {
      case 'agent':
        redirectUrl = '/';
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

// =================== ROUTES POUR LE SUPERVISEUR NIVEAU 2 ===================

// Route pour obtenir les superviseurs level 1 et agents du système
app.get('/api/supervisor2/overview', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user || user.role !== 'supervisor' || user.level !== 2) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle superviseur level 2 requis.'
      });
    }

    // Récupérer le sous-système
    const subsystem = await Subsystem.findById(user.subsystem_id);
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Récupérer les superviseurs level 1 du même sous-système
    const supervisors = await User.find({
      role: 'supervisor',
      level: 1,
      subsystem_id: user.subsystem_id,
      is_active: true
    });

    // Récupérer les agents du même sous-système
    const agents = await User.find({
      role: 'agent',
      subsystem_id: user.subsystem_id,
      is_active: true
    });

    res.json({
      success: true,
      data: {
        subsystem_name: subsystem.name,
        supervisors_count: supervisors.length,
        agents_count: agents.length,
        user_name: user.name
      }
    });

  } catch (error) {
    console.error('Erreur récupération overview:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des données'
    });
  }
});

// =================== ROUTES POUR LES ADMINISTRATEURS DE SOUS-SYSTÈMES ET SUPERVISEURS NIVEAU 2 ===================

// Fonction utilitaire pour obtenir le sous-système en fonction de l'utilisateur
async function getSubsystemForUser(user) {
  let subsystem;
  
  if (user.role === 'subsystem') {
    // Si c'est un administrateur de sous-système
    subsystem = await Subsystem.findOne({ admin_user: user._id });
  } else if (user.role === 'supervisor' && user.level === 2) {
    // Si c'est un superviseur niveau 2
    subsystem = await Subsystem.findById(user.subsystem_id);
  }
  
  return subsystem;
}

// Route pour lister les utilisateurs du sous-système
app.get('/api/subsystem/users', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const user = req.currentUser;
    const subsystem = await getSubsystemForUser(user);
    
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
        return {
          ...user.toObject(),
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

        return {
          ...user.toObject(),
          agents_count: agents.length,
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

// Route pour obtenir les détails d'un utilisateur spécifique
app.get('/api/subsystem/users/:id', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const subsystem = await getSubsystemForUser(currentUser);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const userId = req.params.id;
    
    // Vérifier que l'utilisateur demandé appartient au même sous-système
    const user = await User.findOne({
      _id: userId,
      subsystem_id: subsystem._id
    }).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé dans votre sous-système'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Erreur récupération utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération de l\'utilisateur'
    });
  }
});

// Route pour activer/désactiver un utilisateur
app.put('/api/subsystem/users/:id/status', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const { is_active } = req.body;

    const userId = req.params.id;

    // Vérifier que l'utilisateur appartient au même sous-système
    const subsystem = await getSubsystemForUser(currentUser);
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

    // Empêcher un utilisateur de se désactiver lui-même
    if (user._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Vous ne pouvez pas modifier votre propre statut'
      });
    }

    user.is_active = is_active;
    await user.save();

    // Mettre à jour les statistiques du sous-système
    const activeUsersCount = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      is_active: true,
      role: { $in: ['agent', 'supervisor'] }
    });
    
    subsystem.stats.active_users = activeUsersCount;
    subsystem.stats.usage_percentage = Math.round((activeUsersCount / subsystem.max_users) * 100);
    await subsystem.save();

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
app.put('/api/subsystem/users/:id', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const userId = req.params.id;
    const { name, level, password } = req.body;

    // Vérifier que l'utilisateur appartient au même sous-système
    const subsystem = await getSubsystemForUser(currentUser);
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

    // Empêcher la modification d'un utilisateur avec un rôle supérieur
    if (user.role === 'subsystem' && currentUser.role !== 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Vous ne pouvez pas modifier un administrateur de sous-système'
      });
    }

    // Mettre à jour les champs
    if (name) user.name = name;
    if (level && (user.role === 'supervisor')) user.level = level;
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
app.post('/api/subsystem/assign', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const { userId, supervisorId, supervisorType } = req.body;

    // Vérifier que tous les utilisateurs appartiennent au même sous-système
    const subsystem = await getSubsystemForUser(currentUser);
    
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

    // Vérifier que le superviseur est bien un superviseur
    if (supervisor.role !== 'supervisor') {
      return res.status(400).json({
        success: false,
        error: 'L\'utilisateur assigné comme superviseur n\'a pas le rôle superviseur'
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
app.get('/api/subsystem/stats', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const subsystem = await getSubsystemForUser(currentUser);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    // Compter les utilisateurs
    const totalUsers = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      role: { $in: ['agent', 'supervisor'] }
    });
    const activeUsers = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      is_active: true,
      role: { $in: ['agent', 'supervisor'] }
    });

    // Calculer le pourcentage d'utilisation
    const usage_percentage = subsystem.max_users > 0 ? 
      Math.round((activeUsers / subsystem.max_users) * 100) : 0;

    // Mettre à jour les stats dans la base
    subsystem.stats.active_users = activeUsers;
    subsystem.stats.usage_percentage = usage_percentage;
    await subsystem.save();

    res.json({
      success: true,
      stats: {
        total_users: totalUsers,
        active_users: activeUsers,
        max_users: subsystem.max_users,
        usage_percentage: usage_percentage
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
          today_sales: 0,
          today_tickets: 0,
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
          today_sales: 0,
          today_tickets: 0,
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
      const active_agents = await User.countDocuments({ 
        subsystem_id: subsystem._id,
        role: 'agent',
        is_active: true
      });

      return {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        total_sales: 0,
        total_payout: 0,
        profit: 0,
        master_commission: 0,
        active_agents: active_agents,
        profit_rate: 0
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

    // Regrouper par sous-système
    const subsystemsMap = new Map();
    
    const subsystems = await Subsystem.find();
    
    subsystems.forEach(subsystem => {
      const subsystemId = subsystem._id.toString();
      subsystemsMap.set(subsystemId, {
        subsystem_id: subsystemId,
        subsystem_name: subsystem.name,
        tickets_count: 0,
        total_sales: 0,
        total_payout: 0,
        profit: 0
      });
    });

    const subsystems_detail = Array.from(subsystemsMap.values());

    const report = {
      period: {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      },
      summary: {
        total_tickets: 0,
        total_sales: 0,
        total_payout: 0,
        total_profit: 0,
        profit_margin: 0
      },
      subsystems_detail: subsystems_detail,
      daily_breakdown: []
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
    } else if (user.role === 'supervisor' && user.level === 2) {
      // Les superviseurs niveau 2 peuvent voir leur sous-système
      subsystems = await Subsystem.find({ 
        _id: user.subsystem_id,
        is_active: true 
      });
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
        email: user.email,
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
  console.log(`👮 Control Level 1: http://localhost:${PORT}/control-level1.html`);
  console.log(`👮 Control Level 2: http://localhost:${PORT}/control-level2.html`);
  console.log(`📊 Supervisor Control: http://localhost:${PORT}/supervisor-control.html`);
  console.log(`🏠 Login: http://localhost:${PORT}/`);
  console.log('');
  console.log('✅ Serveur prêt avec toutes les routes !');
  console.log('');
  console.log('📋 Routes API SOUS-SYSTÈMES (Admin + Supervisor Level 2) disponibles:');
  console.log('  GET    /api/subsystem/users             - Lister utilisateurs');
  console.log('  GET    /api/subsystem/users/:id         - Détails utilisateur');
  console.log('  PUT    /api/subsystem/users/:id/status  - Activer/désactiver utilisateur');
  console.log('  PUT    /api/subsystem/users/:id         - Modifier utilisateur');
  console.log('  POST   /api/subsystem/assign            - Assigner superviseur');
  console.log('  GET    /api/subsystem/stats             - Statistiques sous-système');
  console.log('');
  console.log('📋 Routes API SUPERVISEUR NIVEAU 2:');
  console.log('  GET    /api/supervisor2/overview        - Aperçu du sous-système');
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
  console.log('  POST   /api/agents/create               - Créer agent');
  console.log('  GET    /api/subsystems/mine             - Récupérer mes sous-systèmes');
  console.log('');
  console.log('⚠️  IMPORTANT: Assurez-vous d\'avoir un compte master dans la base de données:');
  console.log('   - username: master');
  console.log('   - password: master123');
  console.log('   - role: master');
});