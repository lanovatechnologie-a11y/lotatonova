const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, '')));

// Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/novalotto', {
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
  name: String,
  role: { type: String, enum: ['agent', 'supervisor', 'admin', 'master'], default: 'agent' },
  level: Number, // Pour superviseurs (1, 2, 3...)
  subsystem: String,
  subsystemName: String,
  dateCreation: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// === ROUTES API ===

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Serveur Nova Lotto opérationnel',
    timestamp: new Date().toISOString(),
    mongo: mongoose.connection.readyState === 1 ? 'connecté' : 'déconnecté'
  });
});

// 2. Connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, level } = req.body;
    
    console.log('Tentative connexion:', { username });
    
    const user = await User.findOne({ 
      username: username,
      password: password
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiant ou mot de passe incorrect'
      });
    }
    
    if (level && user.role === 'supervisor' && user.level !== parseInt(level)) {
      return res.status(403).json({
        success: false,
        error: 'Niveau de supervision incorrect'
      });
    }
    
    const token = `nova_${Date.now()}_${user._id}`;
    
    res.json({
      success: true,
      token: token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level || null
      },
      subsystem: user.subsystem ? {
        id: user.subsystem,
        name: user.subsystemName
      } : null
    });
    
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// 3. Inscription
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, role, level } = req.body;
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Cet identifiant est déjà utilisé'
      });
    }
    
    const newUser = new User({
      username: username,
      password: password,
      name: name || username,
      role: role || 'agent',
      level: level || null,
      dateCreation: new Date()
    });
    
    await newUser.save();
    
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      userId: newUser._id
    });
    
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// 4. Liste des utilisateurs (pour admin)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username name role level dateCreation');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 5. Route racine - sert index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 6. Routes pour autres pages HTML
app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

app.get('/lotato2.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato2.html'));
});

// Démarrer serveur
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Backend Nova Lotto sur port ${PORT}`);
});