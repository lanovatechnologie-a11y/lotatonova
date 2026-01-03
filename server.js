const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve tous les fichiers statiques à la racine (où se trouve `server.js`)
app.use(express.static(__dirname));

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

// === ROUTES HTML ===
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

// 3. Exemple avec contrôle token + fichiers HTML
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

// 4. Gestion 404/500 sans fichier 404.html (comme demandé)
app.use((err, req, res, next) => {
  if (err) {
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur interne'
    });
  }
  next();
});

// Démarrer le serveur
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📁 Serveur de fichiers statiques à la racine`);
});
