const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');

const app = express();

// === MIDDLEWARE GZIP COMPRESSION ===
app.use(compression({
    level: 6, // Niveau de compression optimal (1-9)
    threshold: 1024, // Compresser seulement les fichiers > 1KB
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
    maxAge: '1d', // Cache pour 1 jour
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Connexion MongoDB (avec URL de prod ou localhost)
mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/lottodb', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Connexion MongoDB échouée'));
db.once('open', () => {
  console.log('✅ MongoDB connecté avec succès !');
});

// Schema utilisateur
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['agent', 'supervisor', 'subsystem', 'master'],
    required: true
  },
  level: { type: Number, default: 1 }
});

const User = mongoose.model('User', userSchema);

// === ROUTE DE CONNEXION ===
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const user = await User.findOne({ 
      username,
      password,
      role,
      deleted: { $exists: false } // Si champ "deleted" existe dans les modèles
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
      case 'subsystem':
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

// === MIDDLWARE DE VÉRIFICATION DE TOKEN ===
function vérifierToken(req, res, next) {
  const { token } = req.query;
  if (!token || !token.startsWith('nova_')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Token manquant ou invalide' 
    });
  }
  // Ne vérifie pas le token en détail pour garder le système léger
  next();
}

// === ROUTES API AVEC COMPRESSION ===

// Route pour les statistiques du système
app.get('/api/system/stats', vérifierToken, async (req, res) => {
    try {
        const stats = {
            activeAgents: await User.countDocuments({ role: 'agent', deleted: { $exists: false } }),
            openTickets: 0, // À adapter selon votre modèle
            todaySales: 0, // À adapter selon votre modèle
            pendingTasks: 0 // À adapter selon votre modèle
        };
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des stats' });
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

// Route pour les agents
app.get('/api/agents', vérifierToken, async (req, res) => {
    try {
        const agents = await User.find({ role: 'agent', deleted: { $exists: false } });
        res.json({ success: true, agents });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors du chargement des agents' });
    }
});

// Route pour créer un agent
app.post('/api/agents/create', vérifierToken, async (req, res) => {
    try {
        const { name, email, level, password } = req.body;
        const newAgent = new User({
            username: email,
            password: password,
            role: 'agent',
            level: parseInt(level)
        });
        await newAgent.save();
        res.json({ success: true, message: 'Agent créé avec succès' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Erreur lors de la création de l\'agent' });
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
            activeAgents: await User.countDocuments({ role: 'agent', deleted: { $exists: false } }),
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

// === ROUTES HTML AVEC COMPRESSION ===
const fs = require('fs');

// 1. Page principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Sous-système (subsystem-admin.html)
app.get('/subsystem-admin.html', vérifierToken, (req, res) => {
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

// 3. Autres pages avec contrôle token
app.get('/control-level1.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/supervisor-control.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor-control.html'));
});

app.get('/master-dashboard.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

app.get('/lotato.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

// === MIDDLEWARE DE GESTION D'ERREURS ===
app.use((err, req, res, next) => {
  if (err) {
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur interne'
    });
  }
  next();
});

// === DÉMARRAGE DU SERVEUR ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📁 Compression GZIP activée`);
  console.log(`⚡ Application optimisée pour la performance`);
});
