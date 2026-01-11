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

// Schéma pour l'historique
const historySchema = new mongoose.Schema({
  id: { type: String, required: true },
  date: { type: String, required: true },
  draw: { type: String, required: true },
  draw_time: { type: String, required: true },
  bets: [betSchema],
  total: { type: Number, required: true }
});

const History = mongoose.model('History', historySchema);

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

// =================== ROUTES DE BASE ===================

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

// =================== ROUTES POUR LOTATO ===================

// Route pour obtenir tous les tickets
app.get('/api/tickets', vérifierToken, async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ date: -1 }).limit(100);
    const nextTicketNumber = (await Ticket.findOne().sort({ number: -1 }))?.number + 1 || 100001;
    
    res.json({
      success: true,
      tickets: tickets,
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

// Route pour sauvegarder un ticket
app.post('/api/tickets', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time, bets, agentId, agentName } = req.body;
    
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
      agent_id: agentId || req.tokenInfo?.userId,
      agent_name: agentName || 'Agent',
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
    console.error('Erreur sauvegarde ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde du ticket'
    });
  }
});

// Route pour les tickets en attente
app.get('/api/tickets/pending', vérifierToken, async (req, res) => {
  try {
    const tickets = await Ticket.find({ is_synced: false }).sort({ date: -1 }).limit(50);
    
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
    const ticket = req.body;
    
    // Rechercher si un ticket avec le même ID existe déjà
    const existingTicket = await Ticket.findById(ticket.id);
    
    if (existingTicket) {
      // Mettre à jour le ticket existant
      existingTicket.is_synced = false;
      existingTicket.synced_at = null;
      await existingTicket.save();
      
      res.json({
        success: true,
        message: 'Ticket mis à jour comme en attente'
      });
    } else {
      // Créer un nouveau ticket
      const newTicket = new Ticket({
        _id: ticket.id,
        number: ticket.number,
        draw: ticket.draw,
        draw_time: ticket.draw_time,
        date: ticket.date,
        bets: ticket.bets,
        total: ticket.total,
        agent_id: req.tokenInfo?.userId,
        agent_name: ticket.agentName || 'Agent',
        is_synced: false
      });
      
      await newTicket.save();
      
      res.json({
        success: true,
        message: 'Ticket en attente sauvegardé'
      });
    }
  } catch (error) {
    console.error('Erreur sauvegarde ticket en attente:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde du ticket en attente'
    });
  }
});

// Route pour les tickets gagnants
app.get('/api/tickets/winning', vérifierToken, async (req, res) => {
  try {
    const winners = await Winner.find().sort({ date: -1 }).limit(50);
    
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
    console.error('Erreur chargement tickets gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des tickets gagnants'
    });
  }
});

// Route pour l'historique
app.get('/api/history', vérifierToken, async (req, res) => {
  try {
    const history = await History.find().sort({ date: -1 }).limit(100);
    
    res.json({
      success: true,
      history: history
    });
  } catch (error) {
    console.error('Erreur chargement historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement de l\'historique'
    });
  }
});

// Route pour sauvegarder l'historique
app.post('/api/history', vérifierToken, async (req, res) => {
  try {
    const historyRecord = req.body;
    
    // Vérifier si l'enregistrement existe déjà
    const existingRecord = await History.findOne({ id: historyRecord.id });
    
    if (existingRecord) {
      // Mettre à jour l'enregistrement existant
      existingRecord.date = historyRecord.date;
      existingRecord.draw = historyRecord.draw;
      existingRecord.draw_time = historyRecord.draw_time;
      existingRecord.bets = historyRecord.bets;
      existingRecord.total = historyRecord.total;
      await existingRecord.save();
    } else {
      // Créer un nouvel enregistrement
      const newRecord = new History(historyRecord);
      await newRecord.save();
    }
    
    res.json({
      success: true,
      message: 'Historique sauvegardé'
    });
  } catch (error) {
    console.error('Erreur sauvegarde historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde de l\'historique'
    });
  }
});

// Route pour les résultats
app.get('/api/results', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time } = req.query;
    
    let query = {};
    if (draw) query.draw = draw;
    if (draw_time) query.draw_time = draw_time;
    
    const results = await Result.find(query).sort({ date: -1 }).limit(50);
    
    // Formater les résultats pour le frontend
    const formattedResults = {};
    results.forEach(result => {
      if (!formattedResults[result.draw]) {
        formattedResults[result.draw] = {};
      }
      formattedResults[result.draw][result.draw_time] = {
        date: result.date,
        lot1: result.lot1,
        lot2: result.lot2,
        lot3: result.lot3,
        verified: result.verified
      };
    });
    
    res.json({
      success: true,
      results: formattedResults
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
    
    // Récupérer les tickets pour ce tirage
    const tickets = await Ticket.find({
      draw: draw,
      draw_time: draw_time
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
          // Extraire les 2 derniers chiffres du lot1
          const lot1Last2 = result.lot1.length >= 3 ? result.lot1.substring(1) : result.lot1;
          
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
        } else if (bet.type === 'marriage' || bet.type === 'auto-marriage') {
          const [num1, num2] = bet.number.split('*');
          const lot1Last2 = result.lot1.length >= 3 ? result.lot1.substring(1) : result.lot1;
          const numbers = [lot1Last2, result.lot2, result.lot3];
          
          if (numbers.includes(num1) && numbers.includes(num2)) {
            winAmount = bet.amount * 1000;
            winType = 'Mariage';
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
        } else if (bet.type === 'lotto4' || bet.type === 'auto-lotto4') {
          // Logique Lotto 4
          const lot2 = result.lot2 || '00';
          const lot3 = result.lot3 || '00';
          const lot1Last2 = result.lot1.length >= 3 ? result.lot1.substring(1) : result.lot1;
          
          // Option 1: lot2 + lot3
          const option1Result = lot2 + lot3;
          // Option 2: derniers 2 chiffres de lot1 + lot2
          const option2Result = lot1Last2 + lot2;
          // Option 3: n'importe quel arrangement contenant lot2 et lot3
          
          if (bet.options?.option1 && bet.number === option1Result) {
            winAmount += bet.perOptionAmount * 5000;
            winType = winType ? winType + ', Opsyon 1' : 'Opsyon 1';
            matchedNumber = option1Result;
          }
          
          if (bet.options?.option2 && bet.number === option2Result) {
            winAmount += bet.perOptionAmount * 5000;
            winType = winType ? winType + ', Opsyon 2' : 'Opsyon 2';
            matchedNumber = option2Result;
          }
          
          if (bet.options?.option3) {
            // Vérifier si les 4 chiffres contiennent les deux boules
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
              winAmount += bet.perOptionAmount * 5000;
              winType = winType ? winType + ', Opsyon 3' : 'Opsyon 3';
              matchedNumber = bet.number;
            }
          }
        } else if (bet.type === 'lotto5') {
          // Logique Lotto 5
          const lot1 = result.lot1;
          const lot2 = result.lot2 || '00';
          const lot3 = result.lot3 || '00';
          
          // Option 1: lot1 + lot2
          const option1Result = lot1 + lot2;
          // Option 2: lot1 + lot3
          const option2Result = lot1 + lot3;
          
          if (bet.options?.option1 && bet.number === option1Result) {
            winAmount += bet.perOptionAmount * 25000;
            winType = winType ? winType + ', Opsyon 1' : 'Opsyon 1';
            matchedNumber = option1Result;
          }
          
          if (bet.options?.option2 && bet.number === option2Result) {
            winAmount += bet.perOptionAmount * 25000;
            winType = winType ? winType + ', Opsyon 2' : 'Opsyon 2';
            matchedNumber = option2Result;
          }
          
          if (bet.options?.option3) {
            // Les 5 chiffres doivent contenir tous les chiffres des 3 lots
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
              winAmount += bet.perOptionAmount * 25000;
              winType = winType ? winType + ', Opsyon 3' : 'Opsyon 3';
              matchedNumber = bet.number;
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
        
        // Sauvegarder dans la collection Winner
        const winner = new Winner({
          ticket_id: ticket._id,
          ticket_number: ticket.number,
          draw: ticket.draw,
          draw_time: ticket.draw_time,
          date: new Date(),
          winning_bets: winningBets,
          total_winnings: totalWinnings
        });
        
        await winner.save();
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

// Route pour les fiches multi-tirages
app.get('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
  try {
    const tickets = await MultiDrawTicket.find().sort({ date: -1 }).limit(50);
    
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
    const ticket = req.body;
    
    // Générer un numéro de fiche
    const lastTicket = await MultiDrawTicket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 500001;
    
    const multiDrawTicket = new MultiDrawTicket({
      number: ticketNumber,
      date: new Date(),
      bets: ticket.bets,
      draws: ticket.draws || Array.from(ticket.draws || []),
      total: ticket.totalAmount || ticket.total,
      agent_id: req.tokenInfo?.userId,
      agent_name: ticket.agentName || 'Agent'
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
      report_phone: config.report_phone
    });
  } catch (error) {
    console.error('Erreur chargement info entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des informations de l\'entreprise'
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
        level: user.level
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

// Route pour initialiser les tirages par défaut
app.post('/api/init/draws', vérifierToken, async (req, res) => {
  try {
    const defaultDraws = [
      { name: "Miami (Florida)", code: "miami", icon: "fas fa-sun", times: { morning: "1:30 PM", evening: "9:50 PM" }, order: 1 },
      { name: "Georgia", code: "georgia", icon: "fas fa-map-marker-alt", times: { morning: "12:30 PM", evening: "7:00 PM" }, order: 2 },
      { name: "New York", code: "newyork", icon: "fas fa-building", times: { morning: "2:30 PM", evening: "8:00 PM" }, order: 3 },
      { name: "Texas", code: "texas", icon: "fas fa-hat-cowboy", times: { morning: "12:00 PM", evening: "6:00 PM" }, order: 4 },
      { name: "Tunisie", code: "tunisia", icon: "fas fa-flag", times: { morning: "10:30 AM", evening: "2:00 PM" }, order: 5 }
    ];
    
    for (const drawData of defaultDraws) {
      const existingDraw = await Draw.findOne({ code: drawData.code });
      if (!existingDraw) {
        const draw = new Draw(drawData);
        await draw.save();
      }
    }
    
    res.json({
      success: true,
      message: 'Tirages initialisés avec succès'
    });
  } catch (error) {
    console.error('Erreur initialisation tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'initialisation des tirages'
    });
  }
});

// Route pour initialiser les résultats de test
app.post('/api/init/results', vérifierToken, async (req, res) => {
  try {
    const defaultResults = [
      { draw: 'miami', draw_time: 'morning', date: new Date(), lot1: '451', lot2: '23', lot3: '45', verified: true },
      { draw: 'georgia', draw_time: 'morning', date: new Date(), lot1: '327', lot2: '45', lot3: '89', verified: true },
      { draw: 'newyork', draw_time: 'morning', date: new Date(), lot1: '892', lot2: '34', lot3: '56', verified: true },
      { draw: 'texas', draw_time: 'morning', date: new Date(), lot1: '567', lot2: '89', lot3: '01', verified: true },
      { draw: 'tunisia', draw_time: 'morning', date: new Date(), lot1: '234', lot2: '56', lot3: '78', verified: true }
    ];
    
    for (const resultData of defaultResults) {
      const existingResult = await Result.findOne({ 
        draw: resultData.draw, 
        draw_time: resultData.draw_time,
        date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      });
      
      if (!existingResult) {
        const result = new Result(resultData);
        await result.save();
      }
    }
    
    res.json({
      success: true,
      message: 'Résultats de test initialisés avec succès'
    });
  } catch (error) {
    console.error('Erreur initialisation résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'initialisation des résultats'
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
  console.log('  POST   /api/auth/login');
  console.log('  GET    /api/health');
  console.log('  GET    /api/auth/verify');
  console.log('');
  console.log('🎯 Routes principales LOTATO:');
  console.log('  GET    /api/tickets                     - Liste tous les tickets');
  console.log('  POST   /api/tickets                     - Créer un ticket');
  console.log('  GET    /api/tickets/pending             - Tickets en attente');
  console.log('  POST   /api/tickets/pending             - Sauvegarder ticket en attente');
  console.log('  GET    /api/tickets/winning             - Tickets gagnants');
  console.log('  GET    /api/history                     - Historique');
  console.log('  POST   /api/history                     - Sauvegarder historique');
  console.log('  GET    /api/results                     - Résultats');
  console.log('  POST   /api/check-winners               - Vérifier gagnants');
  console.log('  GET    /api/tickets/multi-draw          - Fiches multi-tirages');
  console.log('  POST   /api/tickets/multi-draw          - Créer fiche multi-tirages');
  console.log('  GET    /api/company-info                - Info entreprise');
  console.log('  GET    /api/logo                        - Logo');
  console.log('  GET    /api/auth/check                  - Vérifier session');
  console.log('');
  console.log('🔧 Routes d\'initialisation:');
  console.log('  POST   /api/init/draws                  - Initialiser tirages');
  console.log('  POST   /api/init/results                - Initialiser résultats');
});