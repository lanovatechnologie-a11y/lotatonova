const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const cors = require('cors');

const app = express();

// === MIDDLEWARE ===
app.use(cors());
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

// =================== SCHÉMAS POUR LOTATO ===================

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

// Schéma pour les tirages
const drawSchema = new mongoose.Schema({
  name: { type: String, required: true },
  drawId: { type: String, required: true, unique: true },
  icon: { type: String, default: 'fas fa-dice' },
  times: {
    morning: { type: String, default: '12:00 PM' },
    evening: { type: String, default: '6:00 PM' }
  },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
});

const Draw = mongoose.model('Draw', drawSchema);

// Schéma pour les résultats
const resultSchema = new mongoose.Schema({
  drawId: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, enum: ['morning', 'evening'], required: true },
  lot1: { type: String, required: true },
  lot2: { type: String, required: true },
  lot3: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Result = mongoose.model('Result', resultSchema);

// Schéma pour les paris
const betSchema = new mongoose.Schema({
  drawId: { type: String, required: true },
  drawTime: { type: String, enum: ['morning', 'evening'], required: true },
  gameType: { type: String, required: true },
  name: { type: String, required: true },
  number: { type: String, required: true },
  amount: { type: Number, required: true },
  multiplier: { type: Number, required: true },
  options: { type: mongoose.Schema.Types.Mixed },
  isGroup: { type: Boolean, default: false },
  details: { type: mongoose.Schema.Types.Mixed },
  isAuto: { type: Boolean, default: false },
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
  createdAt: { type: Date, default: Date.now }
});

const Bet = mongoose.model('Bet', betSchema);

// Schéma pour les fiches
const ticketSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  drawId: { type: String, required: true },
  drawTime: { type: String, enum: ['morning', 'evening'], required: true },
  total: { type: Number, required: true },
  agentId: { type: Number },
  agentName: { type: String },
  isMultiDraw: { type: Boolean, default: false },
  multiDrawIds: [{ type: String }],
  status: { 
    type: String, 
    enum: ['pending', 'synced', 'printed', 'cancelled'], 
    default: 'pending' 
  },
  syncedAt: { type: Date },
  printedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

// Schéma pour les fiches multi-tirages
const multiDrawTicketSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  bets: [{
    gameType: String,
    name: String,
    number: String,
    amount: Number,
    multiplier: Number,
    draws: [String],
    perOptionAmount: Number,
    options: mongoose.Schema.Types.Mixed
  }],
  draws: [{ type: String }],
  total: { type: Number, required: true },
  agentId: { type: Number },
  agentName: { type: String },
  status: { 
    type: String, 
    enum: ['pending', 'synced', 'printed', 'cancelled'], 
    default: 'pending' 
  },
  syncedAt: { type: Date },
  printedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const MultiDrawTicket = mongoose.model('MultiDrawTicket', multiDrawTicketSchema);

// Schéma pour les gagnants
const winnerSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, required: true },
  ticketNumber: { type: String, required: true },
  drawId: { type: String, required: true },
  drawTime: { type: String, required: true },
  winningBets: [{
    name: String,
    number: String,
    matchedNumber: String,
    winType: String,
    winAmount: Number
  }],
  totalWinnings: { type: Number, required: true },
  result: {
    lot1: String,
    lot2: String,
    lot3: String
  },
  date: { type: Date, default: Date.now }
});

const Winner = mongoose.model('Winner', winnerSchema);

// Schéma pour les informations de l'entreprise
const companyInfoSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String },
  address: { type: String },
  reportTitle: { type: String },
  reportPhone: { type: String },
  logoUrl: { type: String },
  updatedAt: { type: Date, default: Date.now }
});

const CompanyInfo = mongoose.model('CompanyInfo', companyInfoSchema);

// =================== ROUTES DE CONNEXION ===================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('Tentative de connexion LOTATO:', { username });
    
    const user = await User.findOne({ 
      username,
      password,
      role: 'agent'  // Seulement les agents peuvent accéder à LOTATO
    });

    if (!user) {
      console.log('Agent non trouvé ou informations incorrectes');
      return res.status(401).json({
        success: false,
        error: 'Identifiants incorrects'
      });
    }

    console.log('Agent trouvé:', user.username);

    // Générer un token simplifié temporaire
    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;

    res.json({
      success: true,
      token: token,
      admin: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level
      }
    });

  } catch (error) {
    console.error('Erreur login LOTATO:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la connexion'
    });
  }
});

// Vérifier la session
app.get('/api/auth/check', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token manquant'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token.startsWith('nova_')) {
      return res.status(401).json({
        success: false,
        error: 'Token invalide'
      });
    }
    
    const parts = token.split('_');
    if (parts.length < 5) {
      return res.status(401).json({
        success: false,
        error: 'Token mal formé'
      });
    }
    
    const userId = parts[2];
    const user = await User.findById(userId);
    
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
    console.error('Erreur vérification session:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Déconnexion
app.post('/api/auth/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Déconnexion réussie'
  });
});

// =================== MIDDLEWARE DE VÉRIFICATION ===================

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Token manquant'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (!token.startsWith('nova_')) {
    return res.status(401).json({
      success: false,
      error: 'Token invalide'
    });
  }
  
  // Extraire les informations du token
  const parts = token.split('_');
  if (parts.length >= 5) {
    req.tokenInfo = {
      token: token,
      userId: parts[2],
      role: parts[3],
      level: parts[4] || '1'
    };
  }
  
  next();
}

// =================== ROUTES POUR LOTATO ===================

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// 1. TI RAGES ET RÉSULTATS

// Obtenir tous les tirages
app.get('/api/draws', async (req, res) => {
  try {
    const draws = await Draw.find({ isActive: true }).sort({ order: 1 });
    
    const drawsObject = {};
    draws.forEach(draw => {
      drawsObject[draw.drawId] = {
        name: draw.name,
        icon: draw.icon,
        times: draw.times,
        countdown: 'Calculé côté client'
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

// Obtenir les derniers résultats
app.get('/api/results/latest', async (req, res) => {
  try {
    const latestResults = {};
    
    // Récupérer les tirages actifs
    const draws = await Draw.find({ isActive: true });
    
    // Pour chaque tirage, chercher le dernier résultat
    for (const draw of draws) {
      const latestResult = await Result.findOne({ drawId: draw.drawId })
        .sort({ date: -1 });
      
      if (latestResult) {
        latestResults[draw.drawId] = {
          lot1: latestResult.lot1,
          lot2: latestResult.lot2,
          lot3: latestResult.lot3,
          date: latestResult.date
        };
      } else {
        // Retourner des résultats par défaut
        latestResults[draw.drawId] = {
          lot1: '---',
          lot2: '---',
          lot3: '---',
          date: new Date()
        };
      }
    }
    
    res.json({
      success: true,
      results: latestResults
    });
  } catch (error) {
    console.error('Erreur chargement résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des résultats'
    });
  }
});

// 2. PARIS ET FICHES

// Soumettre des paris
app.post('/api/bets', verifyToken, async (req, res) => {
  try {
    const { draw, drawTime, bets, agentId, agentName } = req.body;
    
    // Générer un numéro de fiche unique
    const ticketNumber = `T${Date.now().toString().slice(-8)}`;
    
    // Calculer le total
    const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
    
    // Créer la fiche
    const ticket = new Ticket({
      number: ticketNumber,
      drawId: draw,
      drawTime: drawTime,
      total: total,
      agentId: agentId || 1,
      agentName: agentName || 'Agent',
      status: 'pending'
    });
    
    await ticket.save();
    
    // Sauvegarder chaque pari avec référence à la fiche
    for (const betData of bets) {
      const bet = new Bet({
        drawId: draw,
        drawTime: drawTime,
        gameType: betData.type,
        name: betData.name,
        number: betData.number,
        amount: betData.amount,
        multiplier: betData.multiplier,
        options: betData.options || null,
        isGroup: betData.isGroup || false,
        details: betData.details || null,
        isAuto: betData.isAuto || false,
        ticketId: ticket._id
      });
      
      await bet.save();
    }
    
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

// Sauvegarder une fiche
app.post('/api/tickets', verifyToken, async (req, res) => {
  try {
    const { draw, drawTime, bets, agentId, agentName } = req.body;
    
    // Générer un numéro de fiche unique
    const ticketNumber = `T${Date.now().toString().slice(-8)}`;
    
    // Calculer le total
    const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
    
    // Créer la fiche
    const ticket = new Ticket({
      number: ticketNumber,
      drawId: draw,
      drawTime: drawTime,
      total: total,
      agentId: agentId || 1,
      agentName: agentName || 'Agent',
      status: 'pending'
    });
    
    await ticket.save();
    
    // Sauvegarder chaque pari avec référence à la fiche
    for (const betData of bets) {
      const bet = new Bet({
        drawId: draw,
        drawTime: drawTime,
        gameType: betData.type,
        name: betData.name,
        number: betData.number,
        amount: betData.amount,
        multiplier: betData.multiplier,
        options: betData.options || null,
        isGroup: betData.isGroup || false,
        details: betData.details || null,
        isAuto: betData.isAuto || false,
        ticketId: ticket._id
      });
      
      await bet.save();
    }
    
    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        number: ticket.number,
        date: ticket.createdAt,
        draw: ticket.drawId,
        drawTime: ticket.drawTime,
        total: ticket.total,
        agentName: ticket.agentName,
        bets: bets
      },
      message: 'Fiche sauvegardée avec succès'
    });
  } catch (error) {
    console.error('Erreur sauvegarde fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde de la fiche'
    });
  }
});

// Obtenir la dernière fiche
app.get('/api/tickets/latest', verifyToken, async (req, res) => {
  try {
    const ticket = await Ticket.findOne()
      .sort({ createdAt: -1 });
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Aucune fiche trouvée'
      });
    }
    
    // Récupérer les paris associés
    const bets = await Bet.find({ ticketId: ticket._id });
    
    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        number: ticket.number,
        date: ticket.createdAt,
        draw: ticket.drawId,
        drawTime: ticket.drawTime,
        total: ticket.total,
        agentName: ticket.agentName,
        bets: bets.map(bet => ({
          type: bet.gameType,
          name: bet.name,
          number: bet.number,
          amount: bet.amount,
          multiplier: bet.multiplier,
          options: bet.options,
          isGroup: bet.isGroup,
          details: bet.details,
          isAuto: bet.isAuto
        }))
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

// Historique des fiches
app.get('/api/tickets/history', verifyToken, async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .sort({ createdAt: -1 })
      .limit(50);
    
    const ticketsWithBets = [];
    
    for (const ticket of tickets) {
      const bets = await Bet.find({ ticketId: ticket._id });
      
      ticketsWithBets.push({
        id: ticket._id,
        number: ticket.number,
        date: ticket.createdAt,
        draw: ticket.drawId,
        drawTime: ticket.drawTime,
        total: ticket.total,
        agentName: ticket.agentName,
        bets: bets.map(bet => ({
          type: bet.gameType,
          name: bet.name,
          number: bet.number,
          amount: bet.amount,
          multiplier: bet.multiplier,
          options: bet.options,
          isGroup: bet.isGroup,
          details: bet.details,
          isAuto: bet.isAuto
        }))
      });
    }
    
    res.json({
      success: true,
      tickets: ticketsWithBets
    });
  } catch (error) {
    console.error('Erreur historique fiches:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement de l\'historique'
    });
  }
});

// Rechercher une fiche
app.get('/api/tickets/search', verifyToken, async (req, res) => {
  try {
    const { number } = req.query;
    
    if (!number) {
      return res.status(400).json({
        success: false,
        error: 'Numéro de fiche requis'
      });
    }
    
    const ticket = await Ticket.findOne({ number: { $regex: number, $options: 'i' } });
    
    if (!ticket) {
      return res.json({
        success: false,
        error: 'Fiche non trouvée'
      });
    }
    
    // Récupérer les paris associés
    const bets = await Bet.find({ ticketId: ticket._id });
    
    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        number: ticket.number,
        date: ticket.createdAt,
        draw: ticket.drawId,
        drawTime: ticket.drawTime,
        total: ticket.total,
        agentName: ticket.agentName,
        bets: bets.map(bet => ({
          type: bet.gameType,
          name: bet.name,
          number: bet.number,
          amount: bet.amount,
          multiplier: bet.multiplier,
          options: bet.options,
          isGroup: bet.isGroup,
          details: bet.details,
          isAuto: bet.isAuto
        }))
      }
    });
  } catch (error) {
    console.error('Erreur recherche fiche:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la recherche'
    });
  }
});

// Toutes les fiches
app.get('/api/tickets/all', verifyToken, async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.createdAt,
        draw: ticket.drawId,
        drawTime: ticket.drawTime,
        total: ticket.total,
        agentName: ticket.agentName,
        status: ticket.status
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

// Obtenir une fiche par ID
app.get('/api/tickets/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const ticket = await Ticket.findById(id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Fiche non trouvée'
      });
    }
    
    // Récupérer les paris associés
    const bets = await Bet.find({ ticketId: ticket._id });
    
    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        number: ticket.number,
        date: ticket.createdAt,
        draw: ticket.drawId,
        drawTime: ticket.drawTime,
        total: ticket.total,
        agentName: ticket.agentName,
        bets: bets.map(bet => ({
          type: bet.gameType,
          name: bet.name,
          number: bet.number,
          amount: bet.amount,
          multiplier: bet.multiplier,
          options: bet.options,
          isGroup: bet.isGroup,
          details: bet.details,
          isAuto: bet.isAuto
        }))
      }
    });
  } catch (error) {
    console.error('Erreur fiche par ID:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de la fiche'
    });
  }
});

// Supprimer une fiche
app.delete('/api/tickets/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Supprimer la fiche
    const ticket = await Ticket.findByIdAndDelete(id);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Fiche non trouvée'
      });
    }
    
    // Supprimer les paris associés
    await Bet.deleteMany({ ticketId: id });
    
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

// 3. FICHES MULTI-TIRAGES

// Sauvegarder une fiche multi-tirages
app.post('/api/tickets/multi', verifyToken, async (req, res) => {
  try {
    const { ticket, agentId, agentName } = req.body;
    
    // Générer un numéro de fiche unique
    const ticketNumber = `M${Date.now().toString().slice(-8)}`;
    
    // Créer la fiche multi-tirages
    const multiDrawTicket = new MultiDrawTicket({
      number: ticketNumber,
      bets: ticket.bets || [],
      draws: ticket.draws ? Array.from(ticket.draws) : [],
      total: ticket.totalAmount || 0,
      agentId: agentId || 1,
      agentName: agentName || 'Agent',
      status: 'pending'
    });
    
    await multiDrawTicket.save();
    
    res.json({
      success: true,
      ticket: {
        id: multiDrawTicket._id,
        number: multiDrawTicket.number,
        date: multiDrawTicket.createdAt,
        bets: multiDrawTicket.bets,
        draws: multiDrawTicket.draws,
        total: multiDrawTicket.total,
        agentName: multiDrawTicket.agentName
      },
      message: 'Fiche multi-tirages sauvegardée avec succès'
    });
  } catch (error) {
    console.error('Erreur sauvegarde fiche multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde de la fiche multi-tirages'
    });
  }
});

// Obtenir toutes les fiches multi-tirages
app.get('/api/tickets/multi', verifyToken, async (req, res) => {
  try {
    const tickets = await MultiDrawTicket.find()
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.createdAt,
        bets: ticket.bets,
        draws: ticket.draws,
        total: ticket.total,
        agentName: ticket.agentName,
        status: ticket.status
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

// 4. GAGNANTS ET RÉSULTATS

// Vérifier les fiches gagnantes
app.post('/api/winners/check', verifyToken, async (req, res) => {
  try {
    const { draw, drawTime } = req.body;
    
    // Récupérer le résultat pour ce tirage
    const result = await Result.findOne({ 
      drawId: draw,
      time: drawTime 
    }).sort({ date: -1 });
    
    if (!result) {
      return res.json({
        success: true,
        winningTickets: [],
        message: 'Aucun résultat trouvé pour ce tirage'
      });
    }
    
    // Récupérer toutes les fiches pour ce tirage
    const tickets = await Ticket.find({ 
      drawId: draw,
      drawTime: drawTime
    });
    
    const winningTickets = [];
    
    // Pour chaque fiche, vérifier si elle contient des paris gagnants
    for (const ticket of tickets) {
      const bets = await Bet.find({ ticketId: ticket._id });
      
      const winningBets = [];
      
      // Logique de vérification des gains
      for (const bet of bets) {
        let winType = '';
        let winAmount = 0;
        let matchedNumber = '';
        
        // Logique de vérification selon le type de jeu
        switch (bet.gameType) {
          case 'borlette':
          case 'boulpe':
            // Vérifier si le numéro correspond à lot1, lot2 ou lot3
            if (bet.number === result.lot1.slice(-2)) {
              winType = '1er lot';
              winAmount = bet.amount * 60; // ×60
              matchedNumber = result.lot1;
            } else if (bet.number === result.lot2.slice(-2)) {
              winType = '2e lot';
              winAmount = bet.amount * 20; // ×20
              matchedNumber = result.lot2;
            } else if (bet.number === result.lot3.slice(-2)) {
              winType = '3e lot';
              winAmount = bet.amount * 10; // ×10
              matchedNumber = result.lot3;
            }
            break;
            
          case 'lotto3':
            // Vérifier Lotto 3
            if (bet.number === result.lot1.slice(-3)) {
              winType = 'Lotto 3 exact';
              winAmount = bet.amount * 500; // ×500
              matchedNumber = result.lot1;
            }
            break;
            
          // Ajouter d'autres types de jeux ici...
        }
        
        if (winAmount > 0) {
          winningBets.push({
            name: bet.name,
            number: bet.number,
            matchedNumber: matchedNumber,
            winType: winType,
            winAmount: winAmount
          });
        }
      }
      
      if (winningBets.length > 0) {
        const totalWinnings = winningBets.reduce((sum, bet) => sum + bet.winAmount, 0);
        
        winningTickets.push({
          ticketId: ticket._id,
          number: ticket.number,
          draw: ticket.drawId,
          drawTime: ticket.drawTime,
          winningBets: winningBets,
          totalWinnings: totalWinnings,
          result: {
            lot1: result.lot1,
            lot2: result.lot2,
            lot3: result.lot3
          },
          date: ticket.createdAt
        });
        
        // Sauvegarder dans la collection des gagnants
        const winner = new Winner({
          ticketId: ticket._id,
          ticketNumber: ticket.number,
          drawId: ticket.drawId,
          drawTime: ticket.drawTime,
          winningBets: winningBets,
          totalWinnings: totalWinnings,
          result: {
            lot1: result.lot1,
            lot2: result.lot2,
            lot3: result.lot3
          }
        });
        
        await winner.save();
      }
    }
    
    res.json({
      success: true,
      winningTickets: winningTickets,
      result: {
        lot1: result.lot1,
        lot2: result.lot2,
        lot3: result.lot3,
        date: result.date
      }
    });
  } catch (error) {
    console.error('Erreur vérification gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification des gagnants'
    });
  }
});

// Obtenir les fiches gagnantes
app.get('/api/winners', verifyToken, async (req, res) => {
  try {
    const winners = await Winner.find()
      .sort({ date: -1 })
      .limit(100);
    
    res.json({
      success: true,
      winningTickets: winners.map(winner => ({
        ticketId: winner.ticketId,
        number: winner.ticketNumber,
        draw: winner.drawId,
        drawTime: winner.drawTime,
        winningBets: winner.winningBets,
        totalWinnings: winner.totalWinnings,
        result: winner.result,
        date: winner.date
      }))
    });
  } catch (error) {
    console.error('Erreur fiches gagnantes:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des fiches gagnantes'
    });
  }
});

// 5. RAPPORTS

// Rapport fin de tirage
app.post('/api/reports/end-of-draw', verifyToken, async (req, res) => {
  try {
    const { draw, drawTime } = req.body;
    
    // Récupérer toutes les fiches pour ce tirage
    const tickets = await Ticket.find({ 
      drawId: draw,
      drawTime: drawTime
    });
    
    const totalTickets = tickets.length;
    const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    
    res.json({
      success: true,
      report: {
        draw: draw,
        drawTime: drawTime,
        totalTickets: totalTickets,
        totalAmount: totalAmount,
        date: new Date()
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

// Rapport général
app.get('/api/reports/general', verifyToken, async (req, res) => {
  try {
    const tickets = await Ticket.find();
    
    const totalTickets = tickets.length;
    const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    
    res.json({
      success: true,
      report: {
        totalTickets: totalTickets,
        totalAmount: totalAmount,
        date: new Date()
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

// Rapport par tirage
app.post('/api/reports/draw', verifyToken, async (req, res) => {
  try {
    const { draw, drawTime } = req.body;
    
    const tickets = await Ticket.find({ 
      drawId: draw,
      drawTime: drawTime
    });
    
    const totalTickets = tickets.length;
    const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
    
    res.json({
      success: true,
      report: {
        draw: draw,
        drawTime: drawTime,
        totalTickets: totalTickets,
        totalAmount: totalAmount,
        date: new Date()
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

// 6. CONFIGURATION

// Informations de l'entreprise
app.get('/api/company', async (req, res) => {
  try {
    let companyInfo = await CompanyInfo.findOne();
    
    if (!companyInfo) {
      // Créer des informations par défaut
      companyInfo = new CompanyInfo({
        name: 'Nova Lotto',
        phone: '+509 32 53 49 58',
        address: 'Cap Haïtien',
        reportTitle: 'Nova Lotto',
        reportPhone: '40104585',
        logoUrl: 'logo-borlette.jpg'
      });
      
      await companyInfo.save();
    }
    
    res.json({
      success: true,
      info: {
        name: companyInfo.name,
        phone: companyInfo.phone,
        address: companyInfo.address,
        reportTitle: companyInfo.reportTitle,
        reportPhone: companyInfo.reportPhone
      }
    });
  } catch (error) {
    console.error('Erreur informations entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des informations'
    });
  }
});

// Logo
app.get('/api/logo', async (req, res) => {
  try {
    const companyInfo = await CompanyInfo.findOne();
    
    res.json({
      success: true,
      logoUrl: companyInfo?.logoUrl || 'logo-borlette.jpg'
    });
  } catch (error) {
    console.error('Erreur logo:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du logo'
    });
  }
});

// Mettre à jour les informations de l'entreprise
app.put('/api/company', verifyToken, async (req, res) => {
  try {
    const { name, phone, address, reportTitle, reportPhone, logoUrl } = req.body;
    
    let companyInfo = await CompanyInfo.findOne();
    
    if (!companyInfo) {
      companyInfo = new CompanyInfo({
        name: name || 'Nova Lotto',
        phone: phone || '',
        address: address || '',
        reportTitle: reportTitle || 'Nova Lotto',
        reportPhone: reportPhone || '',
        logoUrl: logoUrl || 'logo-borlette.jpg'
      });
    } else {
      companyInfo.name = name || companyInfo.name;
      companyInfo.phone = phone || companyInfo.phone;
      companyInfo.address = address || companyInfo.address;
      companyInfo.reportTitle = reportTitle || companyInfo.reportTitle;
      companyInfo.reportPhone = reportPhone || companyInfo.reportPhone;
      companyInfo.logoUrl = logoUrl || companyInfo.logoUrl;
      companyInfo.updatedAt = new Date();
    }
    
    await companyInfo.save();
    
    res.json({
      success: true,
      message: 'Informations mises à jour avec succès',
      info: {
        name: companyInfo.name,
        phone: companyInfo.phone,
        address: companyInfo.address,
        reportTitle: companyInfo.reportTitle,
        reportPhone: companyInfo.reportPhone,
        logoUrl: companyInfo.logoUrl
      }
    });
  } catch (error) {
    console.error('Erreur mise à jour entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour des informations'
    });
  }
});

// =================== ROUTES POUR INITIALISER LA BASE DE DONNÉES ===================

// Initialiser les tirages par défaut
app.post('/api/init/draws', verifyToken, async (req, res) => {
  try {
    const defaultDraws = [
      { name: 'Miami', drawId: 'miami', icon: 'fas fa-sun', times: { morning: '1:30 PM', evening: '9:50 PM' }, order: 1 },
      { name: 'Georgia', drawId: 'georgia', icon: 'fas fa-map-marker-alt', times: { morning: '12:30 PM', evening: '7:00 PM' }, order: 2 },
      { name: 'New York', drawId: 'newyork', icon: 'fas fa-building', times: { morning: '2:30 PM', evening: '8:00 PM' }, order: 3 },
      { name: 'Texas', drawId: 'texas', icon: 'fas fa-hat-cowboy', times: { morning: '12:00 PM', evening: '6:00 PM' }, order: 4 },
      { name: 'Tunisie', drawId: 'tunisia', icon: 'fas fa-flag', times: { morning: '10:30 AM', evening: '2:00 PM' }, order: 5 }
    ];
    
    // Supprimer les tirages existants
    await Draw.deleteMany({});
    
    // Insérer les tirages par défaut
    await Draw.insertMany(defaultDraws);
    
    res.json({
      success: true,
      message: 'Tirages initialisés avec succès',
      draws: defaultDraws
    });
  } catch (error) {
    console.error('Erreur initialisation tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'initialisation des tirages'
    });
  }
});

// Route pour créer un agent (pour les tests)
app.post('/api/init/agent', async (req, res) => {
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
    
    const agent = new User({
      username: username,
      password: password,
      name: name || 'Agent Test',
      role: 'agent',
      level: 1
    });
    
    await agent.save();
    
    res.json({
      success: true,
      message: 'Agent créé avec succès',
      agent: {
        id: agent._id,
        username: agent.username,
        name: agent.name,
        role: agent.role
      }
    });
  } catch (error) {
    console.error('Erreur création agent:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de l\'agent'
    });
  }
});

// =================== ROUTES POUR LES SOUS-SYSTÈMES (gardées de l'ancien code) ===================

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

// Routes pour les sous-systèmes (gardées de l'ancien code)
app.post('/api/master/subsystems', verifyToken, async (req, res) => {
  // ... (garder le code existant pour les sous-systèmes)
});

app.get('/api/master/subsystems', verifyToken, async (req, res) => {
  // ... (garder le code existant)
});

// =================== ROUTES HTML ===================

// Page principale (login)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Toutes les autres pages HTML
app.get('/*.html', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send('Page non trouvée');
    }
    
    res.sendFile(filePath);
  });
});

// Routes spécifiques
app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

app.get('/subsystem-admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

app.get('/master-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

// ... autres routes HTML

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
  console.log(`🚀 Serveur LOTATO démarré sur le port ${PORT}`);
  console.log(`📁 Compression GZIP activée`);
  console.log(`🎰 LOTATO Interface: http://localhost:${PORT}/lotato.html`);
  console.log(`🏠 Login: http://localhost:${PORT}/`);
  console.log('');
  console.log('✅ Serveur LOTATO prêt avec toutes les routes !');
  console.log('');
  console.log('📋 Routes API LOTATO disponibles:');
  console.log('  POST /api/auth/login');
  console.log('  GET  /api/auth/check');
  console.log('  POST /api/auth/logout');
  console.log('  GET  /api/health');
  console.log('  GET  /api/draws');
  console.log('  GET  /api/results/latest');
  console.log('  POST /api/bets');
  console.log('  POST /api/tickets');
  console.log('  GET  /api/tickets/latest');
  console.log('  GET  /api/tickets/history');
  console.log('  GET  /api/tickets/search');
  console.log('  GET  /api/tickets/all');
  console.log('  GET  /api/tickets/:id');
  console.log('  DELETE /api/tickets/:id');
  console.log('  POST /api/tickets/multi');
  console.log('  GET  /api/tickets/multi');
  console.log('  POST /api/winners/check');
  console.log('  GET  /api/winners');
  console.log('  POST /api/reports/end-of-draw');
  console.log('  GET  /api/reports/general');
  console.log('  POST /api/reports/draw');
  console.log('  GET  /api/company');
  console.log('  GET  /api/logo');
  console.log('  PUT  /api/company');
  console.log('  POST /api/init/draws');
  console.log('  POST /api/init/agent');
  console.log('');
  console.log('💾 Modèles MongoDB créés:');
  console.log('  - User (utilisateurs)');
  console.log('  - Draw (tirages)');
  console.log('  - Result (résultats)');
  console.log('  - Bet (paris)');
  console.log('  - Ticket (fiches)');
  console.log('  - MultiDrawTicket (fiches multi-tirages)');
  console.log('  - Winner (gagnants)');
  console.log('  - CompanyInfo (informations entreprise)');
  console.log('  - Subsystem (sous-systèmes)');
});