const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const moment = require('moment');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variables d'environnement
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lotato';
const JWT_SECRET = process.env.JWT_SECRET || 'lotato-super-secret-key-2024-nova';

// Connexion MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Erreur de connexion MongoDB:'));
db.once('open', () => {
  console.log('✅ Connecté à MongoDB');
  initializeDatabase();
});

// =================== SCHÉMAS MONGODB ===================

// Schéma Utilisateur
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['agent', 'supervisor1', 'supervisor2', 'subsystem', 'master'],
    required: true 
  },
  email: { type: String },
  phone: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  permissions: [String]
});

// Schéma Ticket (Fiche de pari)
const ticketSchema = new mongoose.Schema({
  ticketNumber: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, required: true },
  userRole: { type: String, required: true },
  draw: { type: String, required: true }, // miami, georgia, newyork, texas, tunisia
  drawTime: { type: String, required: true }, // morning, evening
  bets: [{
    gameType: { type: String, required: true },
    gameName: { type: String, required: true },
    numbers: { type: String, required: true }, // Format: "12" ou "123" ou "12*34"
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    options: { type: Object } // Pour Lotto4/Lotto5 options
  }],
  totalAmount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'cancelled', 'won', 'lost'],
    default: 'pending'
  },
  isMultiDraw: { type: Boolean, default: false },
  multiDraws: [{ type: String }], // Liste des tirages pour multi-tirages
  winningAmount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  printedAt: { type: Date },
  syncedToCentral: { type: Boolean, default: false },
  syncError: { type: String }
});

// Schéma Résultats
const resultSchema = new mongoose.Schema({
  draw: { type: String, required: true },
  drawTime: { type: String, required: true },
  date: { type: Date, required: true },
  lot1: { type: String, required: true }, // 3 chiffres
  lot2: { type: String, required: true }, // 2 chiffres
  lot3: { type: String, required: true }, // 2 chiffres
  verified: { type: Boolean, default: false },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date }
});

// Schéma Fiche Multi-Tirages
const multiDrawTicketSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, required: true },
  draws: [{ type: String, required: true }],
  bets: [{
    gameType: { type: String, required: true },
    gameName: { type: String, required: true },
    numbers: { type: String, required: true },
    amountPerDraw: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    totalAmount: { type: Number, required: true } // amountPerDraw × nombre de tirages
  }],
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['active', 'printed', 'cancelled'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  printedAt: { type: Date }
});

// Schéma Historique
const historySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  details: { type: Object },
  timestamp: { type: Date, default: Date.now }
});

// Schéma Informations Entreprise
const companyInfoSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  email: { type: String },
  logoUrl: { type: String },
  reportTitle: { type: String },
  reportPhone: { type: String },
  updatedAt: { type: Date, default: Date.now }
});

// Schéma Configuration
const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed },
  description: { type: String }
});

// Création des modèles
const User = mongoose.model('User', userSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const Result = mongoose.model('Result', resultSchema);
const MultiDrawTicket = mongoose.model('MultiDrawTicket', multiDrawTicketSchema);
const History = mongoose.model('History', historySchema);
const CompanyInfo = mongoose.model('CompanyInfo', companyInfoSchema);
const Config = mongoose.model('Config', configSchema);

// =================== MIDDLEWARE D'AUTHENTIFICATION ===================

const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || 
                  req.query.token || 
                  req.body.token;

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token d\'authentification requis' 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: 'Utilisateur non trouvé ou désactivé' 
      });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      error: 'Token invalide ou expiré' 
    });
  }
};

// =================== ROUTES D'AUTHENTIFICATION ===================

// Route de connexion (compatible avec index.html)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Rechercher l'utilisateur
    const user = await User.findOne({ username, role });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants incorrects'
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants incorrects'
      });
    }

    // Mettre à jour la dernière connexion
    user.lastLogin = new Date();
    await user.save();

    // Créer le token JWT
    const token = jwt.sign(
      { 
        userId: user._id, 
        username: user.username, 
        role: user.role,
        name: user.name 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Déterminer l'URL de redirection en fonction du rôle
    let redirectUrl = '/lotato.html';
    if (role === 'master') {
      redirectUrl = '/master-dashboard.html';
    } else if (role === 'subsystem') {
      redirectUrl = '/subsystem-admin.html';
    } else if (role === 'supervisor1' || role === 'supervisor2') {
      redirectUrl = '/supervisor-control.html';
    }

    // Enregistrer l'action dans l'historique
    await History.create({
      userId: user._id,
      action: 'login',
      details: { ip: req.ip, userAgent: req.headers['user-agent'] }
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        email: user.email,
        phone: user.phone
      },
      redirectUrl
    });

  } catch (error) {
    console.error('Erreur de connexion:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la connexion'
    });
  }
});

// Vérifier un token (pour auto-login)
app.post('/api/auth/verify-token', verifyToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        name: req.user.name,
        role: req.user.role
      },
      redirectUrl: getRedirectUrlByRole(req.user.role)
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Token invalide'
    });
  }
});

function getRedirectUrlByRole(role) {
  switch(role) {
    case 'master': return '/master-dashboard.html';
    case 'subsystem': return '/subsystem-admin.html';
    case 'supervisor1':
    case 'supervisor2': return '/supervisor-control.html';
    case 'agent': 
    default: return '/lotato.html';
  }
}

// =================== ROUTES DE SANTÉ ET CONFIGURATION ===================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected',
    version: '4.6'
  });
});

// =================== ROUTES POUR LES RÉSULTATS ===================

// Récupérer les résultats
app.get('/api/results', async (req, res) => {
  try {
    const { draw, drawTime, date } = req.query;
    let query = {};
    
    if (draw) query.draw = draw;
    if (drawTime) query.drawTime = drawTime;
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }

    // Par défaut, récupérer les résultats des dernières 24h
    if (!date && !draw && !drawTime) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      query.date = { $gte: yesterday };
    }

    const results = await Result.find(query).sort({ date: -1 });
    
    res.json({
      success: true,
      results: results.map(r => ({
        draw: r.draw,
        drawTime: r.drawTime,
        date: r.date,
        lot1: r.lot1,
        lot2: r.lot2,
        lot3: r.lot3,
        verified: r.verified
      }))
    });
  } catch (error) {
    console.error('Erreur récupération résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des résultats'
    });
  }
});

// Vérifier les tickets gagnants
app.post('/api/check-winners', verifyToken, async (req, res) => {
  try {
    const { draw, drawTime, date } = req.body;
    
    // Récupérer les résultats
    const result = await Result.findOne({
      draw,
      drawTime,
      date: { 
        $gte: new Date(date + 'T00:00:00'), 
        $lt: new Date(date + 'T23:59:59') 
      }
    });

    if (!result) {
      return res.json({
        success: true,
        winners: [],
        message: 'Aucun résultat trouvé pour cette période'
      });
    }

    // Récupérer tous les tickets pour ce tirage
    const tickets = await Ticket.find({
      draw,
      drawTime,
      createdAt: {
        $gte: new Date(date + 'T00:00:00'),
        $lt: new Date(date + 'T23:59:59')
      },
      status: { $in: ['pending', 'confirmed'] }
    });

    // Fonction pour vérifier si un ticket est gagnant
    const winningTickets = tickets.filter(ticket => {
      return ticket.bets.some(bet => checkBetWins(bet, result));
    }).map(ticket => {
      const winningBets = ticket.bets.filter(bet => checkBetWins(bet, result));
      const totalWin = winningBets.reduce((sum, bet) => {
        return sum + (bet.amount * bet.multiplier);
      }, 0);

      return {
        ticketNumber: ticket.ticketNumber,
        userId: ticket.userId,
        username: ticket.username,
        winningBets: winningBets.map(bet => ({
          gameType: bet.gameType,
          gameName: bet.gameName,
          numbers: bet.numbers,
          amount: bet.amount,
          multiplier: bet.multiplier,
          winAmount: bet.amount * bet.multiplier
        })),
        totalWin,
        createdAt: ticket.createdAt
      };
    });

    res.json({
      success: true,
      result: {
        draw: result.draw,
        drawTime: result.drawTime,
        date: result.date,
        lot1: result.lot1,
        lot2: result.lot2,
        lot3: result.lot3
      },
      winners: winningTickets,
      totalWinners: winningTickets.length,
      totalWinAmount: winningTickets.reduce((sum, t) => sum + t.totalWin, 0)
    });

  } catch (error) {
    console.error('Erreur vérification gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification des gagnants'
    });
  }
});

// Fonction pour vérifier si un pari est gagnant
function checkBetWins(bet, result) {
  const { gameType, numbers } = bet;
  
  switch(gameType) {
    case 'borlette':
    case 'boulpe':
      // Vérifier contre les 3 lots (2 derniers chiffres pour lot1)
      const lot1Last2 = result.lot1.substring(1);
      return numbers === lot1Last2 || numbers === result.lot2 || numbers === result.lot3;
    
    case 'lotto3':
      return numbers === result.lot1;
    
    case 'lotto4':
      // Règles Lotto 4 avec 3 options
      const option1 = result.lot2 + result.lot3;
      const option2 = result.lot1.substring(1) + result.lot2;
      
      // Option 3: vérifier si les chiffres contiennent lot2 et lot3
      const betDigits = numbers.split('');
      const lot2Digits = result.lot2.split('');
      const lot3Digits = result.lot3.split('');
      
      let containsLot2 = true;
      let containsLot3 = true;
      const tempDigits = [...betDigits];
      
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
      
      return numbers === option1 || numbers === option2 || (containsLot2 && containsLot3);
    
    case 'lotto5':
      // Règles Lotto 5 avec 3 options
      const option1_5 = result.lot1 + result.lot2;
      const option2_5 = result.lot1 + result.lot3;
      
      // Option 3: vérifier si les chiffres sont présents dans la combinaison des 3 lots
      const allDigits = (result.lot1 + result.lot2 + result.lot3).split('');
      const betDigits_5 = numbers.split('');
      
      let allFound = true;
      const tempAllDigits = [...allDigits];
      
      for (const digit of betDigits_5) {
        const index = tempAllDigits.indexOf(digit);
        if (index === -1) {
          allFound = false;
          break;
        }
        tempAllDigits.splice(index, 1);
      }
      
      return numbers === option1_5 || numbers === option2_5 || allFound;
    
    case 'marriage':
    case 'auto-marriage':
      const [num1, num2] = numbers.split('*');
      const lot1Last2_m = result.lot1.substring(1);
      const numbersArray = [lot1Last2_m, result.lot2, result.lot3];
      return numbersArray.includes(num1) && numbersArray.includes(num2);
    
    case 'grap':
      // Vérifier si le lot1 est un grap (3 chiffres identiques)
      if (result.lot1[0] === result.lot1[1] && result.lot1[1] === result.lot1[2]) {
        return numbers === result.lot1;
      }
      return false;
    
    case 'auto-lotto4':
      // Même logique que lotto4 option 3
      const betDigits_auto = numbers.split('');
      const lot2Digits_auto = result.lot2.split('');
      const lot3Digits_auto = result.lot3.split('');
      
      let containsLot2_auto = true;
      let containsLot3_auto = true;
      const tempDigits_auto = [...betDigits_auto];
      
      for (const digit of lot2Digits_auto) {
        const index = tempDigits_auto.indexOf(digit);
        if (index === -1) {
          containsLot2_auto = false;
          break;
        }
        tempDigits_auto.splice(index, 1);
      }
      
      for (const digit of lot3Digits_auto) {
        const index = tempDigits_auto.indexOf(digit);
        if (index === -1) {
          containsLot3_auto = false;
          break;
        }
        tempDigits_auto.splice(index, 1);
      }
      
      return containsLot2_auto && containsLot3_auto;
    
    default:
      return false;
  }
}

// =================== ROUTES POUR LES TICKETS ===================

// Créer un ticket
app.post('/api/tickets', verifyToken, async (req, res) => {
  try {
    const { draw, drawTime, bets, isMultiDraw = false, multiDraws = [] } = req.body;
    
    // Générer un numéro de ticket unique
    const ticketNumber = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    // Calculer le montant total
    const totalAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);
    
    // Créer le ticket
    const ticket = new Ticket({
      ticketNumber,
      userId: req.user._id,
      username: req.user.username,
      userRole: req.user.role,
      draw,
      drawTime,
      bets,
      totalAmount,
      isMultiDraw,
      multiDraws: isMultiDraw ? multiDraws : [],
      status: 'confirmed'
    });

    await ticket.save();

    // Enregistrer dans l'historique
    await History.create({
      userId: req.user._id,
      action: 'ticket_created',
      details: { 
        ticketNumber, 
        draw, 
        drawTime, 
        totalAmount,
        betCount: bets.length 
      }
    });

    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        draw: ticket.draw,
        drawTime: ticket.drawTime,
        bets: ticket.bets,
        totalAmount: ticket.totalAmount,
        createdAt: ticket.createdAt
      }
    });

  } catch (error) {
    console.error('Erreur création ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du ticket'
    });
  }
});

// Récupérer les tickets
app.get('/api/tickets', verifyToken, async (req, res) => {
  try {
    const { 
      status, 
      draw, 
      drawTime, 
      startDate, 
      endDate,
      page = 1, 
      limit = 50 
    } = req.query;

    let query = { userId: req.user._id };
    
    if (status) query.status = status;
    if (draw) query.draw = draw;
    if (drawTime) query.drawTime = drawTime;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        query.createdAt.$lt = end;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const tickets = await Ticket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Ticket.countDocuments(query);

    res.json({
      success: true,
      tickets: tickets.map(t => ({
        id: t._id,
        ticketNumber: t.ticketNumber,
        draw: t.draw,
        drawTime: t.drawTime,
        bets: t.bets,
        totalAmount: t.totalAmount,
        status: t.status,
        winningAmount: t.winningAmount,
        createdAt: t.createdAt,
        printedAt: t.printedAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des tickets'
    });
  }
});

// Récupérer les tickets en attente
app.get('/api/tickets/pending', verifyToken, async (req, res) => {
  try {
    const tickets = await Ticket.find({
      userId: req.user._id,
      status: 'pending',
      syncedToCentral: false
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      tickets: tickets.map(t => ({
        id: t._id,
        ticketNumber: t.ticketNumber,
        draw: t.draw,
        drawTime: t.drawTime,
        bets: t.bets,
        totalAmount: t.totalAmount,
        createdAt: t.createdAt
      }))
    });
  } catch (error) {
    console.error('Erreur récupération tickets en attente:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des tickets en attente'
    });
  }
});

// Récupérer les tickets gagnants
app.get('/api/tickets/winning', verifyToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = {
      userId: req.user._id,
      status: 'won'
    };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        query.createdAt.$lt = end;
      }
    }

    const tickets = await Ticket.find(query)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      tickets: tickets.map(t => ({
        id: t._id,
        ticketNumber: t.ticketNumber,
        draw: t.draw,
        drawTime: t.drawTime,
        bets: t.bets,
        totalAmount: t.totalAmount,
        winningAmount: t.winningAmount,
        createdAt: t.createdAt
      })),
      totalWinningAmount: tickets.reduce((sum, t) => sum + t.winningAmount, 0)
    });
  } catch (error) {
    console.error('Erreur récupération tickets gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des tickets gagnants'
    });
  }
});

// =================== ROUTES POUR LES FICHES MULTI-TIRAGES ===================

// Créer une fiche multi-tirages
app.post('/api/tickets/multi-draw', verifyToken, async (req, res) => {
  try {
    const { draws, bets } = req.body;
    
    // Générer un ID unique
    const ticketId = `M${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    // Calculer les totaux
    const betsWithTotals = bets.map(bet => ({
      ...bet,
      totalAmount: bet.amountPerDraw * draws.length
    }));
    
    const totalAmount = betsWithTotals.reduce((sum, bet) => sum + bet.totalAmount, 0);
    
    // Créer la fiche multi-tirages
    const multiDrawTicket = new MultiDrawTicket({
      ticketId,
      userId: req.user._id,
      username: req.user.username,
      draws,
      bets: betsWithTotals,
      totalAmount
    });

    await multiDrawTicket.save();

    // Enregistrer dans l'historique
    await History.create({
      userId: req.user._id,
      action: 'multi_draw_ticket_created',
      details: { 
        ticketId, 
        draws, 
        totalAmount,
        betCount: bets.length 
      }
    });

    res.json({
      success: true,
      ticket: {
        id: multiDrawTicket._id,
        ticketId: multiDrawTicket.ticketId,
        draws: multiDrawTicket.draws,
        bets: multiDrawTicket.bets,
        totalAmount: multiDrawTicket.totalAmount,
        status: multiDrawTicket.status,
        createdAt: multiDrawTicket.createdAt
      }
    });

  } catch (error) {
    console.error('Erreur création fiche multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de la fiche multi-tirages'
    });
  }
});

// Récupérer les fiches multi-tirages
app.get('/api/tickets/multi-draw', verifyToken, async (req, res) => {
  try {
    const multiDrawTickets = await MultiDrawTicket.find({
      userId: req.user._id
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      tickets: multiDrawTickets.map(t => ({
        id: t._id,
        ticketId: t.ticketId,
        draws: t.draws,
        bets: t.bets,
        totalAmount: t.totalAmount,
        status: t.status,
        createdAt: t.createdAt,
        printedAt: t.printedAt
      }))
    });
  } catch (error) {
    console.error('Erreur récupération fiches multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des fiches multi-tirages'
    });
  }
});

// =================== ROUTES POUR L'HISTORIQUE ===================

app.get('/api/history', verifyToken, async (req, res) => {
  try {
    const { action, startDate, endDate, page = 1, limit = 100 } = req.query;
    
    let query = { userId: req.user._id };
    
    if (action) query.action = action;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        query.timestamp.$lt = end;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const history = await History.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await History.countDocuments(query);

    res.json({
      success: true,
      history: history.map(h => ({
        id: h._id,
        action: h.action,
        details: h.details,
        timestamp: h.timestamp
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
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

// =================== ROUTES POUR LES INFORMATIONS DE L'ENTREPRISE ===================

// Récupérer les informations de l'entreprise
app.get('/api/company-info', async (req, res) => {
  try {
    let companyInfo = await CompanyInfo.findOne();
    
    if (!companyInfo) {
      // Créer des informations par défaut si elles n'existent pas
      companyInfo = await CompanyInfo.create({
        name: 'Nova Lotto',
        phone: '+509 32 53 49 58',
        address: 'Cap Haïtien',
        email: 'info@novalotto.com',
        logoUrl: '/logo-borlette.jpg',
        reportTitle: 'Nova Lotto',
        reportPhone: '40104585'
      });
    }

    res.json({
      success: true,
      companyInfo: {
        name: companyInfo.name,
        phone: companyInfo.phone,
        address: companyInfo.address,
        email: companyInfo.email,
        logoUrl: companyInfo.logoUrl,
        reportTitle: companyInfo.reportTitle,
        reportPhone: companyInfo.reportPhone,
        updatedAt: companyInfo.updatedAt
      }
    });
  } catch (error) {
    console.error('Erreur récupération infos entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des informations de l\'entreprise'
    });
  }
});

// Mettre à jour les informations de l'entreprise (admin seulement)
app.put('/api/company-info', verifyToken, async (req, res) => {
  try {
    if (!['master', 'subsystem'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Permission refusée'
      });
    }

    const updateData = req.body;
    updateData.updatedAt = new Date();

    const companyInfo = await CompanyInfo.findOneAndUpdate(
      {},
      updateData,
      { new: true, upsert: true }
    );

    // Enregistrer dans l'historique
    await History.create({
      userId: req.user._id,
      action: 'company_info_updated',
      details: updateData
    });

    res.json({
      success: true,
      companyInfo: {
        name: companyInfo.name,
        phone: companyInfo.phone,
        address: companyInfo.address,
        email: companyInfo.email,
        logoUrl: companyInfo.logoUrl,
        reportTitle: companyInfo.reportTitle,
        reportPhone: companyInfo.reportPhone,
        updatedAt: companyInfo.updatedAt
      }
    });
  } catch (error) {
    console.error('Erreur mise à jour infos entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour des informations de l\'entreprise'
    });
  }
});

// Route pour le logo
app.get('/api/logo', async (req, res) => {
  try {
    const companyInfo = await CompanyInfo.findOne();
    const logoUrl = companyInfo?.logoUrl || '/logo-borlette.jpg';
    
    res.json({
      success: true,
      logoUrl
    });
  } catch (error) {
    res.json({
      success: true,
      logoUrl: '/logo-borlette.jpg'
    });
  }
});

// =================== ROUTES ADMINISTRATION ===================

// Créer un nouvel utilisateur (admin seulement)
app.post('/api/admin/users', verifyToken, async (req, res) => {
  try {
    if (!['master', 'subsystem'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Permission refusée'
      });
    }

    const { username, password, name, role, email, phone } = req.body;
    
    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Ce nom d\'utilisateur est déjà pris'
      });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer l'utilisateur
    const user = new User({
      username,
      password: hashedPassword,
      name,
      role,
      email,
      phone,
      isActive: true
    });

    await user.save();

    // Enregistrer dans l'historique
    await History.create({
      userId: req.user._id,
      action: 'user_created',
      details: { 
        createdUserId: user._id,
        username: user.username,
        role: user.role 
      }
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de l\'utilisateur'
    });
  }
});

// Récupérer tous les utilisateurs (admin seulement)
app.get('/api/admin/users', verifyToken, async (req, res) => {
  try {
    if (!['master', 'subsystem'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Permission refusée'
      });
    }

    const users = await User.find().select('-password').sort({ createdAt: -1 });

    res.json({
      success: true,
      users: users.map(u => ({
        id: u._id,
        username: u.username,
        name: u.name,
        role: u.role,
        email: u.email,
        phone: u.phone,
        isActive: u.isActive,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin
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

// Statistiques administratives
app.get('/api/admin/statistics', verifyToken, async (req, res) => {
  try {
    if (!['master', 'subsystem'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Permission refusée'
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Statistiques pour aujourd'hui
    const todayTickets = await Ticket.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });

    const todayAmount = await Ticket.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
          status: { $in: ['confirmed', 'won'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    const todayWinningAmount = await Ticket.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
          status: 'won'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$winningAmount' }
        }
      }
    ]);

    // Totaux
    const totalTickets = await Ticket.countDocuments();
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });

    res.json({
      success: true,
      statistics: {
        today: {
          tickets: todayTickets,
          amount: todayAmount[0]?.total || 0,
          winningAmount: todayWinningAmount[0]?.total || 0
        },
        totals: {
          tickets: totalTickets,
          users: totalUsers,
          activeUsers: activeUsers
        }
      }
    });

  } catch (error) {
    console.error('Erreur récupération statistiques:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques'
    });
  }
});

// =================== ROUTES POUR LES FICHIERS STATIQUES ===================

// Servir les fichiers HTML
app.use(express.static(__dirname));

// Route par défaut pour les pages HTML
app.get('/*.html', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send('Page non trouvée');
    }
    res.sendFile(filePath);
  });
});

// Route racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// =================== FONCTION D'INITIALISATION ===================

async function initializeDatabase() {
  try {
    // Vérifier si un utilisateur master existe
    const masterExists = await User.findOne({ role: 'master' });
    
    if (!masterExists) {
      // Créer un utilisateur master par défaut
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await User.create({
        username: 'master',
        password: hashedPassword,
        name: 'Master Administrateur',
        role: 'master',
        email: 'master@lotato.com',
        phone: '+509 00 00 00 00'
      });
      
      console.log('✅ Utilisateur master créé: master / admin123');
    }

    // Créer des utilisateurs de démonstration si nécessaire
    const demoUsers = [
      {
        username: 'agent1',
        password: 'agent123',
        name: 'Agent 1',
        role: 'agent',
        email: 'agent1@lotato.com',
        phone: '+509 11 11 11 11'
      },
      {
        username: 'supervisor1',
        password: 'super123',
        name: 'Superviseur 1',
        role: 'supervisor1',
        email: 'super1@lotato.com',
        phone: '+509 22 22 22 22'
      },
      {
        username: 'subsystem',
        password: 'sub123',
        name: 'Propriétaire',
        role: 'subsystem',
        email: 'owner@lotato.com',
        phone: '+509 33 33 33 33'
      }
    ];

    for (const userData of demoUsers) {
      const existingUser = await User.findOne({ username: userData.username });
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        await User.create({
          ...userData,
          password: hashedPassword
        });
        console.log(`✅ Utilisateur démo créé: ${userData.username} / ${userData.password}`);
      }
    }

    // Initialiser les résultats de démonstration
    const demoResults = [
      {
        draw: 'miami',
        drawTime: 'morning',
        date: new Date(),
        lot1: '123',
        lot2: '45',
        lot3: '67'
      },
      {
        draw: 'georgia',
        drawTime: 'morning',
        date: new Date(),
        lot1: '456',
        lot2: '78',
        lot3: '90'
      },
      {
        draw: 'newyork',
        drawTime: 'morning',
        date: new Date(),
        lot1: '789',
        lot2: '12',
        lot3: '34'
      }
    ];

    for (const resultData of demoResults) {
      const existingResult = await Result.findOne({
        draw: resultData.draw,
        drawTime: resultData.drawTime,
        date: { 
          $gte: new Date(resultData.date.toISOString().split('T')[0] + 'T00:00:00'),
          $lt: new Date(resultData.date.toISOString().split('T')[0] + 'T23:59:59')
        }
      });

      if (!existingResult) {
        await Result.create(resultData);
        console.log(`✅ Résultat démo créé: ${resultData.draw} ${resultData.drawTime}`);
      }
    }

    console.log('✅ Base de données initialisée avec succès');

  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error);
  }
}

// =================== DÉMARRAGE DU SERVEUR ===================

app.listen(PORT, () => {
  console.log(`🚀 Serveur Lotato démarré sur le port ${PORT}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`👑 Page de connexion: http://localhost:${PORT}/`);
  console.log(`🎰 Application Lotato: http://localhost:${PORT}/lotato.html`);
  console.log('');
  console.log('📋 Routes API disponibles:');
  console.log('  POST /api/auth/login          - Connexion utilisateur');
  console.log('  POST /api/auth/verify-token   - Vérification token');
  console.log('  GET  /api/health              - Santé du serveur');
  console.log('  GET  /api/results             - Récupérer les résultats');
  console.log('  POST /api/check-winners       - Vérifier les gagnants');
  console.log('  POST /api/tickets             - Créer un ticket');
  console.log('  GET  /api/tickets             - Récupérer les tickets');
  console.log('  GET  /api/tickets/pending     - Tickets en attente');
  console.log('  GET  /api/tickets/winning     - Tickets gagnants');
  console.log('  POST /api/tickets/multi-draw  - Fiches multi-tirages');
  console.log('  GET  /api/history             - Historique');
  console.log('  GET  /api/company-info        - Infos entreprise');
  console.log('  GET  /api/logo                - Logo');
  console.log('');
  console.log('🔐 Identifiants de démonstration:');
  console.log('  Master:      master / admin123');
  console.log('  Agent:       agent1 / agent123');
  console.log('  Superviseur: supervisor1 / super123');
  console.log('  Propriétaire: subsystem / sub123');
});