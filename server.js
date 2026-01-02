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
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Erreur MongoDB:'));
db.once('open', () => {
  console.log('✅ MongoDB CONNECTÉ avec succès !');
});

// Modèle Utilisateur - Adapté à votre structure existante
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['agent', 'supervisor', 'subsystem', 'master'], 
    required: true 
  },
  dateCreation: { 
    type: Date, 
    default: Date.now 
  }
});

const User = mongoose.model('User', userSchema);

// === ROUTES API ===

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Serveur Nova Lotto opérationnel',
    timestamp: new Date().toISOString(),
    mongo: mongoose.connection.readyState === 1 ? 'connecté' : 'déconnecté',
    version: '2.0'
  });
});

// 2. Connexion améliorée
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    console.log(`Tentative connexion: ${username} (${role})`);
    
    // Rechercher l'utilisateur
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
    const token = `nova_${Date.now()}_${user._id}_${user.role}`;
    
    // Réponse selon le rôle
    const userResponse = {
      id: user._id,
      username: user.username,
      name: user.name,
      role: user.role,
      dateCreation: user.dateCreation
    };
    
    res.json({
      success: true,
      token: token,
      user: userResponse,
      redirectUrl: getRedirectUrl(user.role)
    });
    
  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors de la connexion' 
    });
  }
});

// 3. Inscription
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    
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
      dateCreation: new Date()
    });
    
    await newUser.save();
    
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      userId: newUser._id,
      user: {
        id: newUser._id,
        username: newUser.username,
        name: newUser.name,
        role: newUser.role
      }
    });
    
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors de l\'inscription' 
    });
  }
});

// 4. Liste des utilisateurs par rôle
app.get('/api/users', async (req, res) => {
  try {
    const { role } = req.query;
    const filter = role ? { role } : {};
    
    const users = await User.find(filter, 'username name role dateCreation');
    res.json({
      success: true,
      count: users.length,
      users: users
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur' 
    });
  }
});

// 5. Créer des utilisateurs par défaut - Adapté à votre structure
app.post('/api/auth/create-default-users', async (req, res) => {
  try {
    const defaultUsers = [
      // Agents (5)
      { username: "agent1", password: "nova123", name: "Agent Alpha", role: "agent" },
      { username: "agent2", password: "nova123", name: "Agent Beta", role: "agent" },
      { username: "agent3", password: "nova123", name: "Agent Gamma", role: "agent" },
      { username: "agent4", password: "nova123", name: "Agent Delta", role: "agent" },
      { username: "agent5", password: "nova123", name: "Agent Epsilon", role: "agent" },
      
      // Superviseurs (5)
      { username: "supervisor1", password: "nova123", name: "Superviseur Level 1", role: "supervisor" },
      { username: "supervisor2", password: "nova123", name: "Superviseur Level 2", role: "supervisor" },
      { username: "supervisor3", password: "nova123", name: "Superviseur Level 1", role: "supervisor" },
      { username: "supervisor4", password: "nova123", name: "Superviseur Level 2", role: "supervisor" },
      { username: "supervisor5", password: "nova123", name: "Superviseur Level 1", role: "supervisor" },
      
      // Sous-système (5)
      { username: "subsystem1", password: "nova123", name: "Admin Sous-système A", role: "subsystem" },
      { username: "subsystem2", password: "nova123", name: "Admin Sous-système B", role: "subsystem" },
      { username: "subsystem3", password: "nova123", name: "Admin Sous-système C", role: "subsystem" },
      { username: "subsystem4", password: "nova123", name: "Admin Sous-système D", role: "subsystem" },
      { username: "subsystem5", password: "nova123", name: "Admin Sous-système E", role: "subsystem" },
      
      // Masters (5) - Votre utilisateur master existe déjà
      { username: "master2", password: "nova123", name: "Master Administrateur", role: "master" },
      { username: "master3", password: "nova123", name: "Master Super", role: "master" },
      { username: "master4", password: "nova123", name: "Master Global", role: "master" },
      { username: "master5", password: "nova123", name: "Master System", role: "master" }
    ];
    
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const userData of defaultUsers) {
      const existing = await User.findOne({ username: userData.username });
      if (!existing) {
        const newUser = new User({
          ...userData,
          dateCreation: new Date()
        });
        await newUser.save();
        createdCount++;
      } else {
        skippedCount++;
      }
    }
    
    res.json({
      success: true,
      message: `${createdCount} utilisateurs créés, ${skippedCount} déjà existants`,
      total: await User.countDocuments(),
      breakdown: {
        agents: await User.countDocuments({ role: 'agent' }),
        supervisors: await User.countDocuments({ role: 'supervisor' }),
        subsystems: await User.countDocuments({ role: 'subsystem' }),
        masters: await User.countDocuments({ role: 'master' })
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors de la création des utilisateurs' 
    });
  }
});

// 6. Route pour vérifier l'authentification
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    // Simple vérification de token
    if (token && token.startsWith('nova_')) {
      const parts = token.split('_');
      if (parts.length >= 3) {
        const userId = parts[2];
        const user = await User.findById(userId);
        
        if (user) {
          return res.json({
            success: true,
            user: {
              id: user._id,
              username: user.username,
              name: user.name,
              role: user.role
            }
          });
        }
      }
    }
    
    res.status(401).json({
      success: false,
      error: 'Token invalide'
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

// 7. Route pour logout
app.post('/api/auth/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logout effectué'
  });
});

// 8. Route pour stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = {
      agents: await User.countDocuments({ role: 'agent' }),
      supervisors: await User.countDocuments({ role: 'supervisor' }),
      subsystems: await User.countDocuments({ role: 'subsystem' }),
      masters: await User.countDocuments({ role: 'master' }),
      total: await User.countDocuments()
    };
    
    res.json({
      success: true,
      stats: stats,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

// Fonction pour obtenir l'URL de redirection
function getRedirectUrl(role) {
  switch(role) {
    case 'agent':
      return '/lotato.html';
    case 'supervisor':
      return '/supervisor-control.html';
    case 'subsystem':
      return '/subsystem-admin.html';
    case 'master':
      return '/master-dashboard.html';
    default:
      return '/';
  }
}

// Routes HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

app.get('/supervisor-control.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor-control.html'));
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
  console.log(`🚀 Backend Nova Lotto sur port ${PORT}`);
  console.log(`📁 Accès: http://localhost:${PORT}`);
});
