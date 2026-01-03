const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '')));

// Connexion MongoDB
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Erreur MongoDB:'));
db.once('open', () => {
  console.log('✅ MongoDB CONNECTÉ avec succès !');
});

// Modèle Utilisateur
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['agent', 'supervisor', 'subsystem', 'master'], required: true },
  level: { type: Number, default: 1 },
  dateCreation: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// === ROUTES API ===

// 1. Connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    const user = await User.findOne({ 
      username: username,
      password: password,
      role: role
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiant, mot de passe ou rôle incorrect'
      });
    }
    
    // SUCCÈS
    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;
    
    // Déterminer la redirection selon le rôle ET le niveau
    let redirectUrl;
    switch(user.role) {
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
      token: token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level || 1
      },
      redirectUrl: redirectUrl
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors de la connexion' 
    });
  }
});

// 2. Vérification du token
app.get('/api/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;
    
    if (!token || !token.startsWith('nova_')) {
      return res.status(401).json({
        success: false,
        error: 'Token manquant ou invalide'
      });
    }
    
    const [, , userId, userRole] = token.split('_');
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
    
    if (user.role !== userRole) {
      return res.status(401).json({
        success: false,
        error: 'Rôle incorrect'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level || 1
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

// 3. Routes pour les fichiers HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

app.get('/supervisor-control.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor-control.html'));
});

app.get('/control-level1.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/subsystem-admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

app.get('/master-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

// Démarrer serveur
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur Nova Lotto sur port ${PORT}`);
  console.log(`📁 Accès: http://localhost:${PORT}`);
});
