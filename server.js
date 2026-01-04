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

// Serve fichiers statiques
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

// Schema utilisateur MIS À JOUR
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['agent', 'supervisor1', 'supervisor2', 'subsystem', 'master'],
    required: true
  },
  level: { type: Number, default: 1 }
});

const User = mongoose.model('User', userSchema);

// === ROUTE DE CONNEXION MIS À JOUR ===
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    // Map des rôles vers les URLs de redirection
    const roleRedirectMap = {
      'agent': '/lotato.html',
      'supervisor1': '/control-level1.html',
      'supervisor2': '/control-level2.html',
      'subsystem': '/subsystem-admin.html',
      'master': '/master-dashboard.html'
    };

    // Recherche utilisateur
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

    // Générer un token
    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;

    // Redirection selon rôle
    const redirectUrl = roleRedirectMap[user.role] || '/';

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
    console.error('Erreur login:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la connexion'
    });
  }
});

// === NOUVELLE ROUTE : VÉRIFICATION TOKEN ===
app.post('/api/auth/verify-token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token manquant' 
      });
    }
    
    const token = authHeader.slice(7);
    
    // Vérifier format token
    if (!token.startsWith('nova_')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token invalide' 
      });
    }
    
    // Extraire l'ID utilisateur du token
    const parts = token.split('_');
    if (parts.length < 3) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token mal formé' 
      });
    }
    
    const userId = parts[2];
    
    // Vérifier si l'utilisateur existe
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Utilisateur non trouvé' 
      });
    }
    
    // Map des rôles vers les URLs
    const roleRedirectMap = {
      'agent': '/lotato.html',
      'supervisor1': '/control-level1.html',
      'supervisor2': '/control-level2.html',
      'subsystem': '/subsystem-admin.html',
      'master': '/master-dashboard.html'
    };
    
    const redirectUrl = roleRedirectMap[user.role] || '/';
    
    res.json({
      success: true,
      redirectUrl: redirectUrl,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        level: user.level
      }
    });
    
  } catch (error) {
    console.error('Erreur vérification token:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// === MIDDLEWARE DE VÉRIFICATION DE TOKEN MIS À JOUR ===
function vérifierToken(req, res, next) {
  try {
    // 1. Vérifier Authorization header
    const authHeader = req.headers.authorization;
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } 
    // 2. Vérifier query parameter (pour les pages HTML)
    else if (req.query.token) {
      token = req.query.token;
    }
    // 3. Vérifier body (pour certaines requêtes)
    else if (req.body && req.body.token) {
      token = req.body.token;
    }
    
    if (!token || !token.startsWith('nova_')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token manquant ou invalide' 
      });
    }
    
    // Stocker le token dans la requête pour usage ultérieur
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      error: 'Erreur de vérification du token' 
    });
  }
}

// === ROUTES API AVEC VÉRIFICATION TOKEN ===

// Route pour les statistiques
app.get('/api/system/stats', vérifierToken, async (req, res) => {
  try {
    const stats = {
      activeAgents: await User.countDocuments({ role: 'agent' }),
      activeSupervisors: await User.countDocuments({ role: { $in: ['supervisor1', 'supervisor2'] } }),
      subsystemAdmins: await User.countDocuments({ role: 'subsystem' }),
      masters: await User.countDocuments({ role: 'master' }),
      totalUsers: await User.countDocuments()
    };
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur stats' });
  }
});

// Route pour créer un utilisateur
app.post('/api/users/create', vérifierToken, async (req, res) => {
  try {
    const { username, password, role, level } = req.body;
    
    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nom d\'utilisateur déjà utilisé' 
      });
    }
    
    const newUser = new User({
      username,
      password,
      role: role || 'agent',
      level: level || 1
    });
    
    await newUser.save();
    
    res.json({ 
      success: true, 
      message: 'Utilisateur créé avec succès',
      user: newUser 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur création utilisateur' });
  }
});

// === ROUTES HTML PROTÉGÉES ===

// Route index (sans protection)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour vérifier si un utilisateur est connecté
app.get('/api/auth/check', vérifierToken, async (req, res) => {
  try {
    const token = req.token;
    const parts = token.split('_');
    const userId = parts[2];
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(401).json({ success: false });
    }
    
    res.json({ 
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        level: user.level
      }
    });
  } catch (error) {
    res.status(401).json({ success: false });
  }
});

// Routes des pages protégées
app.get('/control-level1.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/subsystem-admin.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

app.get('/master-dashboard.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

app.get('/lotato.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Route fallback - toutes les autres requêtes HTML
app.get('*.html', vérifierToken, (req, res, next) => {
  const filePath = path.join(__dirname, req.path);
  
  // Vérifier si le fichier existe
  const fs = require('fs');
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return next(); // Passer au middleware suivant
    }
    res.sendFile(filePath);
  });
});

// === GESTION D'ERREURS ===
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvée'
  });
});

app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(500).json({
    success: false,
    error: 'Erreur serveur interne'
  });
});

// === DÉMARRAGE ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📁 Rôles supportés: agent, supervisor1, supervisor2, subsystem, master`);
  console.log(`🔐 Système d'authentification activé`);
});