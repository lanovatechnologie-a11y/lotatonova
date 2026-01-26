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

// =================== SCHÉMAS POUR LOTATO ===================

// Schéma pour les tickets de pari
const ticketSchema = new mongoose.Schema({
  ticketNumber: { type: String, required: true },
  date: { type: Date, default: Date.now },
  draw: { type: String, required: true }, // miami, georgia, etc.
  drawTime: { type: String, required: true }, // morning, evening
  bets: [{
    type: { type: String, required: true }, // borlette, lotto3, etc.
    name: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    multiplier2: { type: Number },
    multiplier3: { type: Number },
    options: { type: Object }, // Pour Lotto 4 et 5
    perOptionAmount: { type: Number },
    isAuto: { type: Boolean, default: false },
    isGroup: { type: Boolean, default: false },
    details: { type: Array },
    isLotto4: { type: Boolean, default: false },
    isLotto5: { type: Boolean, default: false }
  }],
  total: { type: Number, required: true },
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  agentName: { type: String, required: true },
  subsystemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem', required: true },
  status: { type: String, enum: ['pending', 'validated', 'cancelled'], default: 'validated' },
  printed: { type: Boolean, default: false }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

// Schéma pour les tickets multi-tirages
const multiDrawTicketSchema = new mongoose.Schema({
  ticketNumber: { type: String, required: true },
  date: { type: Date, default: Date.now },
  bets: [{
    gameType: { type: String, required: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    draws: [{ type: String }] // Liste des tirages
  }],
  total: { type: Number, required: true },
  draws: [{ type: String }], // Tirages sélectionnés
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  agentName: { type: String, required: true },
  subsystemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem', required: true },
  status: { type: String, enum: ['pending', 'validated', 'cancelled'], default: 'validated' }
});

const MultiDrawTicket = mongoose.model('MultiDrawTicket', multiDrawTicketSchema);

// Schéma pour les résultats des tirages
const resultSchema = new mongoose.Schema({
  draw: { type: String, required: true }, // miami, georgia, etc.
  drawTime: { type: String, required: true }, // morning, evening
  date: { type: Date, required: true },
  lot1: { type: String, required: true }, // 3 chiffres
  lot2: { type: String, required: true }, // 2 chiffres
  lot3: { type: String, required: true }, // 2 chiffres
  subsystemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' }
});

const Result = mongoose.model('Result', resultSchema);

// Schéma pour l'historique des opérations
const historySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  action: { type: String, required: true }, // ticket_created, ticket_printed, etc.
  details: { type: String, required: true },
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agentName: { type: String },
  subsystemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  data: { type: Object } // Données supplémentaires
});

const History = mongoose.model('History', historySchema);

// Schéma pour les informations de l'entreprise (par sous-système)
const companyInfoSchema = new mongoose.Schema({
  subsystemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem', required: true, unique: true },
  company_name: { type: String, default: 'Nova Lotto' },
  company_phone: { type: String, default: '+509 32 53 49 58' },
  company_address: { type: String, default: 'Cap Haïtien' },
  report_title: { type: String, default: 'Nova Lotto' },
  report_phone: { type: String, default: '40104585' },
  logo_url: { type: String, default: 'logo-borlette.jpg' },
  multipliers: {
    borlette: { main: { type: Number, default: 60 }, secondary: { type: Number, default: 20 }, tertiary: { type: Number, default: 10 } },
    boulpe: { main: { type: Number, default: 60 }, secondary: { type: Number, default: 20 }, tertiary: { type: Number, default: 10 } },
    lotto3: { main: { type: Number, default: 500 } },
    lotto4: { main: { type: Number, default: 5000 } },
    lotto5: { main: { type: Number, default: 25000 } },
    grap: { main: { type: Number, default: 500 } },
    marriage: { main: { type: Number, default: 1000 } },
    'auto-marriage': { main: { type: Number, default: 1000 } },
    'auto-lotto4': { main: { type: Number, default: 5000 } }
  },
  supervisor_name: { type: String, default: 'Superviseur Nova' },
  created_by: { type: String, default: 'Système Master' },
  updated_at: { type: Date, default: Date.now }
});

const CompanyInfo = mongoose.model('CompanyInfo', companyInfoSchema);

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

// =================== MIDDLEWARE POUR LES AGENTS ===================

async function vérifierAgent(req, res, next) {
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

    if (user.role !== 'agent') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle agent requis.'
      });
    }

    req.currentUser = user;
    next();
  } catch (error) {
    console.error('Erreur vérification agent:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la vérification des droits'
    });
  }
}

// =================== FONCTIONS UTILITAIRES ===================

// Fonction utilitaire pour obtenir le sous-système en fonction de l'utilisateur
async function getSubsystemForUser(user) {
  let subsystem;
  
  if (user.role === 'subsystem') {
    // Si c'est un administrateur de sous-système
    subsystem = await Subsystem.findOne({ admin_user: user._id });
  } else if (user.role === 'supervisor' && user.level === 2) {
    // Si c'est un superviseur niveau 2
    subsystem = await Subsystem.findById(user.subsystem_id);
  } else if (user.role === 'agent') {
    // Si c'est un agent
    subsystem = await Subsystem.findById(user.subsystem_id);
  }
  
  return subsystem;
}

// Fonction pour vérifier un pari contre un résultat
function checkBetAgainstResult(bet, result) {
  const lot1 = result.lot1;
  const lot2 = result.lot2;
  const lot3 = result.lot3;
  const lot1Last2 = lot1.substring(1);

  let isWinner = false;
  let winAmount = 0;
  let winType = '';
  let matchedNumber = '';

  switch(bet.type) {
    case 'borlette':
      if (bet.number === lot1Last2) {
        isWinner = true;
        winAmount = bet.amount * bet.multiplier;
        winType = '1er lot';
        matchedNumber = lot1Last2;
      } else if (bet.number === lot2) {
        isWinner = true;
        winAmount = bet.amount * (bet.multiplier2 || 20);
        winType = '2e lot';
        matchedNumber = lot2;
      } else if (bet.number === lot3) {
        isWinner = true;
        winAmount = bet.amount * (bet.multiplier3 || 10);
        winType = '3e lot';
        matchedNumber = lot3;
      }
      break;

    case 'boulpe':
      if (bet.number === lot1Last2) {
        isWinner = true;
        winAmount = bet.amount * bet.multiplier;
        winType = '1er lot';
        matchedNumber = lot1Last2;
      } else if (bet.number === lot2) {
        isWinner = true;
        winAmount = bet.amount * (bet.multiplier2 || 20);
        winType = '2e lot';
        matchedNumber = lot2;
      } else if (bet.number === lot3) {
        isWinner = true;
        winAmount = bet.amount * (bet.multiplier3 || 10);
        winType = '3e lot';
        matchedNumber = lot3;
      }
      break;

    case 'lotto3':
      if (bet.number === lot1) {
        isWinner = true;
        winAmount = bet.amount * bet.multiplier;
        winType = 'Lotto 3';
        matchedNumber = lot1;
      }
      break;

    case 'lotto4':
      winAmount = 0;
      winType = '';

      if (bet.options?.option1) {
        const option1Result = lot2 + lot3;
        if (bet.number === option1Result) {
          isWinner = true;
          winAmount += bet.perOptionAmount * bet.multiplier;
          winType += 'Opsyon 1, ';
          matchedNumber = option1Result;
        }
      }

      if (bet.options?.option2) {
        const option2Result = lot1.substring(1) + lot2;
        if (bet.number === option2Result) {
          isWinner = true;
          winAmount += bet.perOptionAmount * bet.multiplier;
          winType += 'Opsyon 2, ';
          matchedNumber = option2Result;
        }
      }

      if (bet.options?.option3) {
        const betDigits = bet.number.split('');
        const lot2Digits = lot2.split('');
        const lot3Digits = lot3.split('');
        const tempDigits = [...betDigits];
        let containsLot2 = true;
        let containsLot3 = true;

        for (const digit of lot2Digits) {
          const index = tempDigits.indexOf(digit);
          if (index === -1) {
            containsLot2 = false;
            break;
          }
          tempDigits.splice(index, 1);
        }

        for (const digit of lot3Digits) {
          const index = tempDigits.indexOf(digit);
          if (index === -1) {
            containsLot3 = false;
            break;
          }
          tempDigits.splice(index, 1);
        }

        if (containsLot2 && containsLot3) {
          isWinner = true;
          winAmount += bet.perOptionAmount * bet.multiplier;
          winType += 'Opsyon 3, ';
          matchedNumber = bet.number;
        }
      }
      break;

    case 'lotto5':
      winAmount = 0;
      winType = '';

      if (bet.options?.option1) {
        const option1Result = lot1 + lot2;
        if (bet.number === option1Result) {
          isWinner = true;
          winAmount += bet.perOptionAmount * bet.multiplier;
          winType += 'Opsyon 1, ';
          matchedNumber = option1Result;
        }
      }

      if (bet.options?.option2) {
        const option2Result = lot1 + lot3;
        if (bet.number === option2Result) {
          isWinner = true;
          winAmount += bet.perOptionAmount * bet.multiplier;
          winType += 'Opsyon 2, ';
          matchedNumber = option2Result;
        }
      }

      if (bet.options?.option3) {
        const allResultDigits = (lot1 + lot2 + lot3).split('');
        const betDigits = bet.number.split('');
        let allFound = true;
        const tempResultDigits = [...allResultDigits];

        for (const digit of betDigits) {
          const index = tempResultDigits.indexOf(digit);
          if (index === -1) {
            allFound = false;
            break;
          }
          tempResultDigits.splice(index, 1);
        }

        if (allFound) {
          isWinner = true;
          winAmount += bet.perOptionAmount * bet.multiplier;
          winType += 'Opsyon 3, ';
          matchedNumber = bet.number;
        }
      }
      break;

    case 'marriage':
    case 'auto-marriage':
      const [num1, num2] = bet.number.split('*');
      const numbers = [lot1Last2, lot2, lot3];

      if (numbers.includes(num1) && numbers.includes(num2)) {
        isWinner = true;
        winAmount = bet.amount * bet.multiplier;
        winType = 'Maryaj';
        matchedNumber = `${num1}*${num2}`;
      }
      break;

    case 'grap':
      if (lot1[0] === lot1[1] && lot1[1] === lot1[2]) {
        if (bet.number === lot1) {
          isWinner = true;
          winAmount = bet.amount * bet.multiplier;
          winType = 'Grap';
          matchedNumber = lot1;
        }
      }
      break;

    case 'auto-lotto4':
      const lotto4Digits = bet.number.split('');
      const autoLot2Digits = lot2.split('');
      const autoLot3Digits = lot3.split('');
      const autoTempDigits = [...lotto4Digits];
      let autoContainsLot2 = true;
      let autoContainsLot3 = true;

      for (const digit of autoLot2Digits) {
        const index = autoTempDigits.indexOf(digit);
        if (index === -1) {
          autoContainsLot2 = false;
          break;
        }
        autoTempDigits.splice(index, 1);
      }

      for (const digit of autoLot3Digits) {
        const index = autoTempDigits.indexOf(digit);
        if (index === -1) {
          autoContainsLot3 = false;
          break;
        }
        autoTempDigits.splice(index, 1);
      }

      if (autoContainsLot2 && autoContainsLot3) {
        isWinner = true;
        winAmount = bet.amount * bet.multiplier;
        winType = 'Lotto 4 Auto';
        matchedNumber = bet.number;
      }
      break;
  }

  return { isWinner, winAmount, winType, matchedNumber };
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

// =================== ROUTES POUR LOTATO.JS ===================

// Route pour vérifier la santé du serveur
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Route pour vérifier l'authentification de l'agent
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
    
    // Récupérer les informations du sous-système
    const subsystem = await Subsystem.findById(user.subsystem_id);
    const companyInfo = await CompanyInfo.findOne({ subsystemId: user.subsystem_id });
    
    res.json({
      success: true,
      admin: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email,
        subsystem_id: user.subsystem_id,
        subsystem_name: subsystem ? subsystem.name : 'Non spécifié',
        supervisor_name: companyInfo ? companyInfo.supervisor_name : 'Superviseur Nova',
        created_by: companyInfo ? companyInfo.created_by : 'Système Master'
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

// Route pour obtenir les résultats
app.get('/api/results', async (req, res) => {
  try {
    // Récupérer les résultats récents (derniers 7 jours)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const results = await Result.find({
      date: { $gte: sevenDaysAgo }
    }).sort({ date: -1 });

    // Organiser les résultats par tirage
    const resultsByDraw = {};
    results.forEach(result => {
      if (!resultsByDraw[result.draw]) {
        resultsByDraw[result.draw] = {};
      }
      resultsByDraw[result.draw][result.drawTime] = {
        date: result.date,
        lot1: result.lot1,
        lot2: result.lot2,
        lot3: result.lot3
      };
    });

    res.json({
      success: true,
      results: resultsByDraw
    });
  } catch (error) {
    console.error('Erreur récupération résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des résultats'
    });
  }
});

// Route pour vérifier les gagnants
app.post('/api/check-winners', vérifierToken, vérifierAgent, async (req, res) => {
  try {
    const { draw, drawTime } = req.body;
    const user = req.currentUser;
    
    // Récupérer le résultat du tirage
    const result = await Result.findOne({ 
      draw: draw,
      drawTime: drawTime 
    }).sort({ date: -1 });

    if (!result) {
      return res.json({
        success: true,
        hasResult: false,
        message: 'Pas de résultat disponible pour ce tirage'
      });
    }

    // Récupérer les tickets de l'agent pour ce tirage
    const tickets = await Ticket.find({
      agentId: user._id,
      draw: draw,
      drawTime: drawTime,
      status: 'validated'
    });

    const winningTickets = [];
    
    // Vérifier chaque ticket
    tickets.forEach(ticket => {
      const winningBets = [];
      let totalWinnings = 0;

      ticket.bets.forEach(bet => {
        const winningInfo = checkBetAgainstResult(bet, {
          lot1: result.lot1,
          lot2: result.lot2,
          lot3: result.lot3
        });

        if (winningInfo.isWinner) {
          winningBets.push({
            ...bet.toObject(),
            winAmount: winningInfo.winAmount,
            winType: winningInfo.winType,
            matchedNumber: winningInfo.matchedNumber
          });
          totalWinnings += winningInfo.winAmount;
        }
      });

      if (winningBets.length > 0) {
        winningTickets.push({
          ticketNumber: ticket.ticketNumber,
          date: ticket.date,
          winningBets: winningBets,
          totalWinnings: totalWinnings,
          result: {
            lot1: result.lot1,
            lot2: result.lot2,
            lot3: result.lot3
          }
        });
      }
    });

    res.json({
      success: true,
      hasResult: true,
      result: {
        lot1: result.lot1,
        lot2: result.lot2,
        lot3: result.lot3
      },
      winningTickets: winningTickets,
      totalWinnings: winningTickets.reduce((sum, ticket) => sum + ticket.totalWinnings, 0)
    });
  } catch (error) {
    console.error('Erreur vérification gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la vérification des gagnants'
    });
  }
});

// Route pour les tickets
app.get('/api/tickets', vérifierToken, vérifierAgent, async (req, res) => {
  try {
    const user = req.currentUser;
    const { limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const tickets = await Ticket.find({
      agentId: user._id,
      subsystemId: user.subsystem_id
    })
    .sort({ date: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await Ticket.countDocuments({
      agentId: user._id,
      subsystemId: user.subsystem_id
    });

    // Récupérer le prochain numéro de ticket
    const lastTicket = await Ticket.findOne({
      agentId: user._id
    }).sort({ date: -1 });

    let nextTicketNumber = 1;
    if (lastTicket && lastTicket.ticketNumber) {
      const lastNumber = parseInt(lastTicket.ticketNumber.replace(/\D/g, ''));
      if (!isNaN(lastNumber)) {
        nextTicketNumber = lastNumber + 1;
      }
    }

    res.json({
      success: true,
      tickets: tickets,
      nextTicketNumber: nextTicketNumber,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / limit)
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

// Route pour créer un ticket
app.post('/api/tickets', vérifierToken, vérifierAgent, async (req, res) => {
  try {
    const user = req.currentUser;
    const { ticketNumber, draw, drawTime, bets, total } = req.body;

    // Validation des données
    if (!ticketNumber || !draw || !drawTime || !bets || !total) {
      return res.status(400).json({
        success: false,
        error: 'Données manquantes'
      });
    }

    // Vérifier si le ticket existe déjà
    const existingTicket = await Ticket.findOne({
      ticketNumber: ticketNumber,
      agentId: user._id
    });

    if (existingTicket) {
      return res.status(400).json({
        success: false,
        error: 'Un ticket avec ce numéro existe déjà'
      });
    }

    // Créer le ticket
    const ticket = new Ticket({
      ticketNumber: ticketNumber,
      date: new Date(),
      draw: draw,
      drawTime: drawTime,
      bets: bets,
      total: total,
      agentId: user._id,
      agentName: user.name,
      subsystemId: user.subsystem_id,
      status: 'validated',
      printed: false
    });

    await ticket.save();

    // Enregistrer dans l'historique
    const history = new History({
      date: new Date(),
      action: 'ticket_created',
      details: `Ticket #${ticketNumber} créé pour ${draw} (${drawTime})`,
      agentId: user._id,
      agentName: user.name,
      subsystemId: user.subsystem_id,
      data: { ticketNumber, draw, drawTime, total }
    });

    await history.save();

    res.json({
      success: true,
      message: 'Ticket sauvegardé avec succès',
      ticket: {
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        date: ticket.date,
        total: ticket.total
      }
    });
  } catch (error) {
    console.error('Erreur création ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création du ticket'
    });
  }
});

// Route pour les tickets en attente
app.get('/api/tickets/pending', vérifierToken, vérifierAgent, async (req, res) => {
  try {
    const user = req.currentUser;

    const pendingTickets = await Ticket.find({
      agentId: user._id,
      subsystemId: user.subsystem_id,
      status: 'pending'
    }).sort({ date: -1 });

    res.json({
      success: true,
      tickets: pendingTickets
    });
  } catch (error) {
    console.error('Erreur récupération tickets en attente:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des tickets en attente'
    });
  }
});

// Route pour les tickets gagnants
app.get('/api/tickets/winning', vérifierToken, vérifierAgent, async (req, res) => {
  try {
    const user = req.currentUser;
    const { draw, drawTime } = req.query;

    let query = {
      agentId: user._id,
      subsystemId: user.subsystem_id,
      status: 'validated'
    };

    if (draw) query.draw = draw;
    if (drawTime) query.drawTime = drawTime;

    const tickets = await Ticket.find(query).sort({ date: -1 });

    // Pour chaque ticket, vérifier s'il est gagnant
    const winningTickets = [];
    
    for (const ticket of tickets) {
      // Récupérer le résultat correspondant
      const result = await Result.findOne({
        draw: ticket.draw,
        drawTime: ticket.drawTime
      }).sort({ date: -1 });

      if (result) {
        const winningBets = [];
        let totalWinnings = 0;

        ticket.bets.forEach(bet => {
          const winningInfo = checkBetAgainstResult(bet, {
            lot1: result.lot1,
            lot2: result.lot2,
            lot3: result.lot3
          });

          if (winningInfo.isWinner) {
            winningBets.push({
              ...bet.toObject(),
              winAmount: winningInfo.winAmount,
              winType: winningInfo.winType,
              matchedNumber: winningInfo.matchedNumber
            });
            totalWinnings += winningInfo.winAmount;
          }
        });

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
    }

    res.json({
      success: true,
      tickets: winningTickets
    });
  } catch (error) {
    console.error('Erreur récupération tickets gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des tickets gagnants'
    });
  }
});

// Route pour l'historique
app.get('/api/history', vérifierToken, vérifierAgent, async (req, res) => {
  try {
    const user = req.currentUser;
    const { limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const history = await History.find({
      $or: [
        { agentId: user._id },
        { subsystemId: user.subsystem_id }
      ]
    })
    .sort({ date: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await History.countDocuments({
      $or: [
        { agentId: user._id },
        { subsystemId: user.subsystem_id }
      ]
    });

    res.json({
      success: true,
      history: history,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur récupération historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération de l\'historique'
    });
  }
});

// Route pour créer un historique
app.post('/api/history', vérifierToken, vérifierAgent, async (req, res) => {
  try {
    const user = req.currentUser;
    const { action, details, data } = req.body;

    if (!action || !details) {
      return res.status(400).json({
        success: false,
        error: 'Action et détails requis'
      });
    }

    const history = new History({
      date: new Date(),
      action: action,
      details: details,
      agentId: user._id,
      agentName: user.name,
      subsystemId: user.subsystem_id,
      data: data
    });

    await history.save();

    res.json({
      success: true,
      message: 'Historique enregistré',
      history: {
        id: history._id,
        date: history.date,
        action: history.action,
        details: history.details
      }
    });
  } catch (error) {
    console.error('Erreur création historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création de l\'historique'
    });
  }
});

// Route pour les tickets multi-tirages
app.get('/api/tickets/multi-draw', vérifierToken, vérifierAgent, async (req, res) => {
  try {
    const user = req.currentUser;
    const { limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const tickets = await MultiDrawTicket.find({
      agentId: user._id,
      subsystemId: user.subsystem_id
    })
    .sort({ date: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await MultiDrawTicket.countDocuments({
      agentId: user._id,
      subsystemId: user.subsystem_id
    });

    res.json({
      success: true,
      tickets: tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur récupération tickets multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des tickets multi-tirages'
    });
  }
});

// Route pour créer un ticket multi-tirage
app.post('/api/tickets/multi-draw', vérifierToken, vérifierAgent, async (req, res) => {
  try {
    const user = req.currentUser;
    const { ticketNumber, bets, total, draws } = req.body;

    if (!ticketNumber || !bets || !total || !draws) {
      return res.status(400).json({
        success: false,
        error: 'Données manquantes'
      });
    }

    // Vérifier si le ticket existe déjà
    const existingTicket = await MultiDrawTicket.findOne({
      ticketNumber: ticketNumber,
      agentId: user._id
    });

    if (existingTicket) {
      return res.status(400).json({
        success: false,
        error: 'Un ticket multi-tirage avec ce numéro existe déjà'
      });
    }

    const multiDrawTicket = new MultiDrawTicket({
      ticketNumber: ticketNumber,
      date: new Date(),
      bets: bets,
      total: total,
      draws: draws,
      agentId: user._id,
      agentName: user.name,
      subsystemId: user.subsystem_id,
      status: 'validated'
    });

    await multiDrawTicket.save();

    // Enregistrer dans l'historique
    const history = new History({
      date: new Date(),
      action: 'multi_draw_ticket_created',
      details: `Ticket multi-tirage #${ticketNumber} créé`,
      agentId: user._id,
      agentName: user.name,
      subsystemId: user.subsystem_id,
      data: { ticketNumber, draws, total }
    });

    await history.save();

    res.json({
      success: true,
      message: 'Ticket multi-tirage sauvegardé avec succès',
      ticket: {
        id: multiDrawTicket._id,
        ticketNumber: multiDrawTicket.ticketNumber,
        date: multiDrawTicket.date,
        total: multiDrawTicket.total
      }
    });
  } catch (error) {
    console.error('Erreur création ticket multi-tirage:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création du ticket multi-tirage'
    });
  }
});

// Route pour les informations de l'entreprise
app.get('/api/company-info', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
    if (!user || !user.subsystem_id) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur ou sous-système non trouvé'
      });
    }

    // Récupérer ou créer les informations de l'entreprise
    let companyInfo = await CompanyInfo.findOne({ subsystemId: user.subsystem_id });
    
    if (!companyInfo) {
      // Créer avec les valeurs par défaut
      companyInfo = new CompanyInfo({
        subsystemId: user.subsystem_id,
        company_name: 'Nova Lotto',
        company_phone: '+509 32 53 49 58',
        company_address: 'Cap Haïtien',
        report_title: 'Nova Lotto',
        report_phone: '40104585',
        logo_url: 'logo-borlette.jpg',
        supervisor_name: 'Superviseur Nova',
        created_by: 'Système Master'
      });
      await companyInfo.save();
    }

    res.json({
      success: true,
      company_name: companyInfo.company_name,
      company_phone: companyInfo.company_phone,
      company_address: companyInfo.company_address,
      report_title: companyInfo.report_title,
      report_phone: companyInfo.report_phone
    });
  } catch (error) {
    console.error('Erreur récupération infos entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des informations de l\'entreprise'
    });
  }
});

// Route pour le logo
app.get('/api/logo', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
    if (!user || !user.subsystem_id) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur ou sous-système non trouvé'
      });
    }

    const companyInfo = await CompanyInfo.findOne({ subsystemId: user.subsystem_id });
    
    let logoUrl = 'logo-borlette.jpg';
    if (companyInfo && companyInfo.logo_url) {
      logoUrl = companyInfo.logo_url;
    }

    res.json({
      success: true,
      logoUrl: logoUrl
    });
  } catch (error) {
    console.error('Erreur récupération logo:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération du logo'
    });
  }
});

// Route pour les informations du sous-système
app.get('/api/subsystem/info', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
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

    const companyInfo = await CompanyInfo.findOne({ subsystemId: user.subsystem_id });
    
    res.json({
      success: true,
      subsystem: {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        contact_email: subsystem.contact_email,
        contact_phone: subsystem.contact_phone
      },
      multipliers: companyInfo ? companyInfo.multipliers : {},
      supervisor_name: companyInfo ? companyInfo.supervisor_name : 'Superviseur Nova',
      created_by: companyInfo ? companyInfo.created_by : 'Système Master'
    });
  } catch (error) {
    console.error('Erreur récupération infos sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des informations du sous-système'
    });
  }
});

// Route pour mettre à jour les informations du sous-système (admin seulement)
app.put('/api/subsystem/info', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const subsystem = await getSubsystemForUser(currentUser);

    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const {
      company_name,
      company_phone,
      company_address,
      report_title,
      report_phone,
      logo_url,
      multipliers,
      supervisor_name,
      created_by
    } = req.body;

    let companyInfo = await CompanyInfo.findOne({ subsystemId: subsystem._id });
    
    if (!companyInfo) {
      companyInfo = new CompanyInfo({
        subsystemId: subsystem._id
      });
    }

    if (company_name !== undefined) companyInfo.company_name = company_name;
    if (company_phone !== undefined) companyInfo.company_phone = company_phone;
    if (company_address !== undefined) companyInfo.company_address = company_address;
    if (report_title !== undefined) companyInfo.report_title = report_title;
    if (report_phone !== undefined) companyInfo.report_phone = report_phone;
    if (logo_url !== undefined) companyInfo.logo_url = logo_url;
    if (multipliers !== undefined) companyInfo.multipliers = multipliers;
    if (supervisor_name !== undefined) companyInfo.supervisor_name = supervisor_name;
    if (created_by !== undefined) companyInfo.created_by = created_by;

    companyInfo.updated_at = new Date();
    await companyInfo.save();

    res.json({
      success: true,
      message: 'Informations du sous-système mises à jour',
      companyInfo: {
        company_name: companyInfo.company_name,
        company_phone: companyInfo.company_phone,
        company_address: companyInfo.company_address,
        report_title: companyInfo.report_title,
        report_phone: companyInfo.report_phone,
        logo_url: companyInfo.logo_url,
        multipliers: companyInfo.multipliers,
        supervisor_name: companyInfo.supervisor_name,
        created_by: companyInfo.created_by
      }
    });
  } catch (error) {
    console.error('Erreur mise à jour infos sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la mise à jour des informations du sous-système'
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
        // Compter les tickets de l'agent aujourd'hui
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const ticketsCount = await Ticket.countDocuments({
          agentId: user._id,
          date: { $gte: today }
        });

        return {
          ...user.toObject(),
          tickets_today: ticketsCount,
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

// =================== ROUTES POUR LES SUPERVISEURS NIVEAU 1 ===================

// Route pour obtenir les statistiques des agents
app.get('/api/supervisor1/agent-stats', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user || user.role !== 'supervisor' || user.level !== 1) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle superviseur level 1 requis.'
      });
    }

    // Récupérer les agents assignés à ce superviseur
    const agents = await User.find({
      role: 'agent',
      subsystem_id: user.subsystem_id,
      $or: [
        { supervisor_id: user._id },
        { supervisor2_id: user._id }
      ],
      is_active: true
    });

    const agentStats = await Promise.all(agents.map(async (agent) => {
      // Compter les tickets de l'agent aujourd'hui
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const ticketsCount = await Ticket.countDocuments({
        agentId: agent._id,
        date: { $gte: today }
      });

      // Calculer le total des ventes aujourd'hui
      const salesResult = await Ticket.aggregate([
        {
          $match: {
            agentId: agent._id,
            date: { $gte: today }
          }
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$total' }
          }
        }
      ]);

      const totalSales = salesResult.length > 0 ? salesResult[0].totalSales : 0;

      return {
        id: agent._id,
        name: agent.name,
        username: agent.username,
        tickets_today: ticketsCount,
        sales_today: totalSales,
        is_online: Math.random() > 0.3 // Simulation
      };
    }));

    // Calculer les totaux
    const totals = {
      total_agents: agents.length,
      total_tickets: agentStats.reduce((sum, stat) => sum + stat.tickets_today, 0),
      total_sales: agentStats.reduce((sum, stat) => sum + stat.sales_today, 0),
      online_agents: agentStats.filter(stat => stat.is_online).length
    };

    res.json({
      success: true,
      agents: agentStats,
      totals: totals
    });

  } catch (error) {
    console.error('Erreur récupération statistiques agents:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

// Route pour les rapports détaillés par agent
app.get('/api/supervisor1/agent-reports/:agentId', vérifierToken, async (req, res) => {
  try {
    const supervisor = await User.findById(req.tokenInfo.userId);
    
    if (!supervisor || supervisor.role !== 'supervisor' || supervisor.level !== 1) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle superviseur level 1 requis.'
      });
    }

    const agentId = req.params.agentId;
    
    // Vérifier que l'agent est assigné à ce superviseur
    const agent = await User.findOne({
      _id: agentId,
      role: 'agent',
      subsystem_id: supervisor.subsystem_id,
      $or: [
        { supervisor_id: supervisor._id },
        { supervisor2_id: supervisor._id }
      ]
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent non trouvé ou non assigné à ce superviseur'
      });
    }

    const { start_date, end_date } = req.query;
    let dateFilter = {};

    if (start_date && end_date) {
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);
      dateFilter = { date: { $gte: startDate, $lte: endDate } };
    } else {
      // Par défaut, aujourd'hui
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateFilter = { date: { $gte: today, $lt: tomorrow } };
    }

    // Récupérer les tickets de l'agent
    const tickets = await Ticket.find({
      agentId: agent._id,
      ...dateFilter
    }).sort({ date: -1 });

    // Récupérer les tickets multi-tirages
    const multiDrawTickets = await MultiDrawTicket.find({
      agentId: agent._id,
      ...dateFilter
    }).sort({ date: -1 });

    // Calculer les totaux
    const totalTickets = tickets.length + multiDrawTickets.length;
    const totalSales = tickets.reduce((sum, ticket) => sum + ticket.total, 0) +
                      multiDrawTickets.reduce((sum, ticket) => sum + ticket.total, 0);

    res.json({
      success: true,
      agent: {
        id: agent._id,
        name: agent.name,
        username: agent.username
      },
      period: dateFilter,
      tickets: tickets,
      multiDrawTickets: multiDrawTickets,
      totals: {
        total_tickets: totalTickets,
        total_sales: totalSales,
        regular_tickets: tickets.length,
        multi_draw_tickets: multiDrawTickets.length
      }
    });

  } catch (error) {
    console.error('Erreur récupération rapport agent:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération du rapport'
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

// =================== ROUTES POUR CRÉER DES DONNÉES DE TEST ===================

// Route pour initialiser les données de test
app.post('/api/init/test-data', async (req, res) => {
  try {
    // Vérifier si des données existent déjà
    const existingTickets = await Ticket.countDocuments();
    const existingResults = await Result.countDocuments();

    if (existingTickets > 0 || existingResults > 0) {
      return res.status(400).json({
        success: false,
        error: 'Des données existent déjà'
      });
    }

    // Créer des résultats de test pour aujourd'hui
    const today = new Date();
    const draws = ['miami', 'georgia', 'newyork', 'texas', 'tunisia'];
    const drawTimes = ['morning', 'evening'];

    const results = [];
    
    for (const draw of draws) {
      for (const drawTime of drawTimes) {
        const result = new Result({
          draw: draw,
          drawTime: drawTime,
          date: today,
          lot1: Math.floor(100 + Math.random() * 900).toString().padStart(3, '0'),
          lot2: Math.floor(10 + Math.random() * 90).toString().padStart(2, '0'),
          lot3: Math.floor(10 + Math.random() * 90).toString().padStart(2, '0')
        });
        results.push(result);
      }
    }

    await Result.insertMany(results);

    // Créer des tickets de test
    const users = await User.find({ role: 'agent', is_active: true }).limit(3);
    
    if (users.length > 0) {
      const testTickets = [];
      const betTypes = ['borlette', 'lotto3', 'marriage', 'lotto4', 'lotto5'];
      
      for (let i = 0; i < 10; i++) {
        const user = users[Math.floor(Math.random() * users.length)];
        const draw = draws[Math.floor(Math.random() * draws.length)];
        const drawTime = drawTimes[Math.floor(Math.random() * drawTimes.length)];
        const betType = betTypes[Math.floor(Math.random() * betTypes.length)];
        
        const ticket = new Ticket({
          ticketNumber: `T${(1000 + i).toString().padStart(6, '0')}`,
          date: new Date(today.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Derniers 7 jours
          draw: draw,
          drawTime: drawTime,
          bets: [{
            type: betType,
            name: betType.toUpperCase(),
            number: betType === 'borlette' ? 
              Math.floor(10 + Math.random() * 90).toString().padStart(2, '0') :
              betType === 'lotto3' ? 
                Math.floor(100 + Math.random() * 900).toString().padStart(3, '0') :
                '12*34',
            amount: Math.floor(1 + Math.random() * 10),
            multiplier: 500
          }],
          total: Math.floor(1 + Math.random() * 10),
          agentId: user._id,
          agentName: user.name,
          subsystemId: user.subsystem_id,
          status: 'validated',
          printed: Math.random() > 0.5
        });
        
        testTickets.push(ticket);
      }
      
      await Ticket.insertMany(testTickets);
    }

    res.json({
      success: true,
      message: 'Données de test créées avec succès',
      results_created: results.length,
      tickets_created: users.length > 0 ? 10 : 0
    });

  } catch (error) {
    console.error('Erreur création données test:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création des données de test'
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
  console.log('📋 Routes LOTATO (Agent) disponibles:');
  console.log('  GET    /api/health                    - Santé du serveur');
  console.log('  GET    /api/results                   - Obtenir les résultats');
  console.log('  POST   /api/check-winners             - Vérifier les gagnants');
  console.log('  GET    /api/tickets                   - Lister les tickets');
  console.log('  POST   /api/tickets                   - Créer un ticket');
  console.log('  GET    /api/tickets/pending           - Tickets en attente');
  console.log('  GET    /api/tickets/winning           - Tickets gagnants');
  console.log('  GET    /api/history                   - Historique');
  console.log('  POST   /api/history                   - Ajouter à l\'historique');
  console.log('  GET    /api/tickets/multi-draw        - Tickets multi-tirages');
  console.log('  POST   /api/tickets/multi-draw        - Créer ticket multi-tirage');
  console.log('  GET    /api/company-info              - Infos entreprise');
  console.log('  GET    /api/logo                      - Logo');
  console.log('  GET    /api/subsystem/info            - Infos sous-système');
  console.log('');
  console.log('📋 Routes API SUPERVISEUR NIVEAU 1:');
  console.log('  GET    /api/supervisor1/agent-stats   - Statistiques agents');
  console.log('  GET    /api/supervisor1/agent-reports/:id - Rapports agent');
  console.log('');
  console.log('📋 Routes API SUPERVISEUR NIVEAU 2:');
  console.log('  GET    /api/supervisor2/overview      - Aperçu du sous-système');
  console.log('');
  console.log('📋 Routes API MASTER DASHBOARD disponibles:');
  console.log('  POST   /api/master/init               - Initialiser compte master');
  console.log('  POST   /api/master/login              - Connexion master');
  console.log('  GET    /api/master/check-session      - Vérifier session master');
  console.log('  POST   /api/master/subsystems         - Créer sous-système');
  console.log('  GET    /api/master/subsystems         - Lister sous-systèmes');
  console.log('  GET    /api/master/subsystems/:id     - Détails sous-système');
  console.log('  PUT    /api/master/subsystems/:id/deactivate - Désactiver sous-système');
  console.log('  PUT    /api/master/subsystems/:id/activate   - Activer sous-système');
  console.log('  GET    /api/master/subsystems/stats   - Statistiques sous-systèmes');
  console.log('  GET    /api/master/consolidated-report - Rapport consolidé');
  console.log('');
  console.log('📋 Routes API SOUS-SYSTÈMES (Admin + Supervisor Level 2) disponibles:');
  console.log('  GET    /api/subsystem/users           - Lister utilisateurs');
  console.log('  GET    /api/subsystem/users/:id       - Détails utilisateur');
  console.log('  PUT    /api/subsystem/users/:id/status - Activer/désactiver utilisateur');
  console.log('  PUT    /api/subsystem/users/:id       - Modifier utilisateur');
  console.log('  POST   /api/subsystem/assign          - Assigner superviseur');
  console.log('  GET    /api/subsystem/stats           - Statistiques sous-système');
  console.log('  PUT    /api/subsystem/info            - Mettre à jour infos sous-système');
  console.log('');
  console.log('📋 Routes API générales:');
  console.log('  POST   /api/auth/login                - Connexion générale');
  console.log('  GET    /api/auth/check                - Vérifier session');
  console.log('  GET    /api/auth/verify               - Vérifier token');
  console.log('  POST   /api/agents/create             - Créer agent');
  console.log('  GET    /api/subsystems/mine           - Récupérer mes sous-systèmes');
  console.log('');
  console.log('📋 Routes DONNÉES TEST:');
  console.log('  POST   /api/init/test-data           - Créer données de test');
  console.log('  POST   /api/init/master              - Initialiser master');
  console.log('  POST   /api/init/subsystem           - Initialiser subsystem');
  console.log('');
  console.log('⚠️  IMPORTANT: Assurez-vous d\'avoir un compte master dans la base de données:');
  console.log('   - username: master');
  console.log('   - password: master123');
  console.log('   - role: master');
});