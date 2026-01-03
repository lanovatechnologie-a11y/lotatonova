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

// Modèle Utilisateur avec niveau pour superviseurs
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['agent', 'supervisor', 'subsystem', 'master'], required: true },
  level: { type: Number, default: 1 }, // Niveau pour les superviseurs
  dateCreation: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// === ROUTES API ===

// 1. Connexion avec gestion des niveaux
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
    
    // Réponse
    const userResponse = {
      id: user._id,
      username: user.username,
      name: user.name,
      role: user.role,
      level: user.level || 1,
      dateCreation: user.dateCreation
    };
    
    // Déterminer la redirection selon le rôle ET le niveau
    let redirectUrl;
    switch(user.role) {
      case 'agent':
        redirectUrl = '/lotato.html';
        break;
      case 'supervisor':
        // Vérifier le niveau du superviseur
        if (user.level === 2) {
          redirectUrl = '/control-level2.html';
        } else {
          redirectUrl = '/control-level1.html';
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
      user: userResponse,
      redirectUrl: redirectUrl
    });
    
  } catch (error) {
    console.error('Erreur login:', error);
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
    
    const parts = token.split('_');
    if (parts.length < 3) {
      return res.status(401).json({
        success: false,
        error: 'Token mal formé'
      });
    }
    
    const userId = parts[2];
    const userRole = parts[3];
    const userLevel = parts[4] || 1;
    
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
    console.error('Erreur vérification:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

// 3. Route pour créer des utilisateurs avec niveaux pour superviseurs
app.post('/api/auth/create-default-users', async (req, res) => {
  try {
    const defaultUsers = [
      // Agents (5)
      { username: "agent1", password: "nova123", name: "Agent Alpha", role: "agent" },
      { username: "agent2", password: "nova123", name: "Agent Beta", role: "agent" },
      { username: "agent3", password: "nova123", name: "Agent Gamma", role: "agent" },
      { username: "agent4", password: "nova123", name: "Agent Delta", role: "agent" },
      { username: "agent5", password: "nova123", name: "Agent Epsilon", role: "agent" },
      
      // Superviseurs Niveau 1 (3)
      { username: "supervisor1", password: "nova123", name: "Superviseur Niveau 1", role: "supervisor", level: 1 },
      { username: "supervisor2", password: "nova123", name: "Superviseur Niveau 1", role: "supervisor", level: 1 },
      { username: "supervisor3", password: "nova123", name: "Superviseur Niveau 1", role: "supervisor", level: 1 },
      
      // Superviseurs Niveau 2 (2)
      { username: "supervisor4", password: "nova123", name: "Superviseur Niveau 2", role: "supervisor", level: 2 },
      { username: "supervisor5", password: "nova123", name: "Superviseur Niveau 2", role: "supervisor", level: 2 },
      
      // Admin Sous-système (5)
      { username: "subsystem1", password: "nova123", name: "Admin SS A", role: "subsystem" },
      { username: "subsystem2", password: "nova123", name: "Admin SS B", role: "subsystem" },
      { username: "subsystem3", password: "nova123", name: "Admin SS C", role: "subsystem" },
      { username: "subsystem4", password: "nova123", name: "Admin SS D", role: "subsystem" },
      { username: "subsystem5", password: "nova123", name: "Admin SS E", role: "subsystem" },
      
      // Masters (4 supplémentaires)
      { username: "master2", password: "nova123", name: "Master Secondaire", role: "master" },
      { username: "master3", password: "nova123", name: "Master Tertiaire", role: "master" },
      { username: "master4", password: "nova123", name: "Master Quartaire", role: "master" },
      { username: "master5", password: "nova123", name: "Master Final", role: "master" }
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
        supervisors_l1: await User.countDocuments({ role: 'supervisor', level: 1 }),
        supervisors_l2: await User.countDocuments({ role: 'supervisor', level: 2 }),
        subsystems: await User.countDocuments({ role: 'subsystem' }),
        masters: await User.countDocuments({ role: 'master' })
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

// 4. Route pour mettre à jour le niveau d'un superviseur
app.put('/api/users/:id/level', async (req, res) => {
  try {
    const { id } = req.params;
    const { level } = req.body;
    
    const user = await User.findById(id);
    
    if (!user || user.role !== 'supervisor') {
      return res.status(404).json({
        success: false,
        error: 'Superviseur non trouvé'
      });
    }
    
    user.level = level;
    await user.save();
    
    res.json({
      success: true,
      message: `Niveau du superviseur mis à jour à ${level}`,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

// 5. Routes pour les fichiers HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
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

// 6. Route pour stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = {
      agents: await User.countDocuments({ role: 'agent' }),
      supervisors_l1: await User.countDocuments({ role: 'supervisor', level: 1 }),
      supervisors_l2: await User.countDocuments({ role: 'supervisor', level: 2 }),
      supervisors_total: await User.countDocuments({ role: 'supervisor' }),
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

// Démarrer serveur
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur Nova Lotto sur port ${PORT}`);
  console.log(`📁 Accès: http://localhost:${PORT}`);
  console.log(`👥 Superviseurs N1: /control-level1.html`);
  console.log(`👥 Superviseurs N2: /control-level2.html`);
});
