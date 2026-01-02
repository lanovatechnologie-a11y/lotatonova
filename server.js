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

// Modèle Utilisateur
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  role: { type: String, enum: ['agent', 'supervisor', 'admin', 'master'], default: 'agent' },
  level: Number,
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
    
    console.log('Tentative connexion:', username);
    
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
    
    // SUCCÈS
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
      }
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

// 4. Liste des utilisateurs
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username name role level dateCreation');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// 5. Créer des utilisateurs par défaut (pour initialiser)
app.post('/api/auth/create-default-users', async (req, res) => {
  try {
    const defaultUsers = [
      {
        username: "maitre01",
        password: "master123",
        name: "Maître Principal",
        role: "master"
      },
      {
        username: "admin",
        password: "admin123",
        name: "Administrateur",
        role: "master"
      },
      {
        username: "agent1",
        password: "agent123",
        name: "Agent Test",
        role: "agent"
      }
    ];
    
    let createdCount = 0;
    
    for (const userData of defaultUsers) {
      const existing = await User.findOne({ username: userData.username });
      if (!existing) {
        const newUser = new User({
          ...userData,
          dateCreation: new Date()
        });
        await newUser.save();
        createdCount++;
      }
    }
    
    res.json({
      success: true,
      message: `${createdCount} utilisateurs créés`,
      total: await User.countDocuments()
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Routes HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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