// server.js - Serveur Lotato avec variable MONGODB-URL
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variables d'environnement - NOTE: Render utilise MONGODB-URL (avec tiret)
const MONGODB_URL = process.env['MONGODB-URL'] || process.env.MONGODB_URI;
const PORT = process.env.PORT || 10000;

// Debug: Afficher les variables d'environnement disponibles
console.log('🔧 Variables d\'environnement disponibles:');
console.log('PORT:', process.env.PORT);
console.log('MONGODB-URL:', process.env['MONGODB-URL'] ? 'Définie' : 'Non définie');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Définie' : 'Non définie');

if (!MONGODB_URL) {
  console.error('❌ ERREUR CRITIQUE: Aucune variable MongoDB trouvée!');
  console.error('⚠️  Vérifiez que MONGODB-URL est définie dans Render Environment');
  console.error('📍 Allez dans: Render Dashboard → Lotatonova → Environment');
  console.error('📍 Ajoutez: MONGODB-URL = votre_uri_mongodb_atlas');
  process.exit(1);
}

// Fonction pour nettoyer l'URL MongoDB (corriger les problèmes de format)
const cleanMongoDBUrl = (url) => {
  if (!url) return url;
  
  // Retirer les guillemets si présents
  let cleanedUrl = url.replace(/["']/g, '');
  
  // Vérifier si l'URL commence bien par mongodb:// ou mongodb+srv://
  if (!cleanedUrl.startsWith('mongodb://') && !cleanedUrl.startsWith('mongodb+srv://')) {
    console.warn('⚠️  L\'URL MongoDB ne semble pas avoir le bon format');
    console.warn('   URL reçue:', cleanedUrl.substring(0, 50) + '...');
  }
  
  // Ajouter le nom de la base de données si absent
  if (!cleanedUrl.includes('/?')) {
    const parts = cleanedUrl.split('/');
    if (parts.length === 3 || (parts.length === 4 && parts[3] === '')) {
      cleanedUrl = cleanedUrl.endsWith('/') ? cleanedUrl + 'lotatonova' : cleanedUrl + '/lotatonova';
    }
  }
  
  return cleanedUrl;
};

// URL MongoDB nettoyée
const MONGO_URI = cleanMongoDBUrl(MONGODB_URL);
console.log('🔗 URI MongoDB (nettoyée):', MONGO_URI.substring(0, 60) + '...');

// ==================== CONNEXION MONGODB ATLAS ====================
const connectToMongoDB = async () => {
  try {
    console.log('🔄 Connexion à MongoDB Atlas...');
    
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority'
    };
    
    await mongoose.connect(MONGO_URI, options);
    
    console.log('✅ MongoDB connecté avec succès!');
    console.log('📊 Base de données:', mongoose.connection.name);
    console.log('📍 Hôte:', mongoose.connection.host);
    
  } catch (error) {
    console.error('❌ ÉCHEC de connexion MongoDB:');
    console.error('Message:', error.message);
    console.error('Code:', error.code || 'N/A');
    
    // Tentative de secours sans SRV
    if (MONGO_URI.includes('+srv://')) {
      console.log('🔄 Tentative avec connexion standard...');
      try {
        const standardURI = MONGO_URI.replace('mongodb+srv://', 'mongodb://');
        await mongoose.connect(standardURI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          serverSelectionTimeoutMS: 30000,
          socketTimeoutMS: 45000
        });
        console.log('✅ Connecté avec URI standard');
      } catch (error2) {
        console.error('❌ Échec complet de connexion');
        console.error('Dernière erreur:', error2.message);
        process.exit(1);
      }
    } else {
      console.error('💀 Impossible de se connecter à MongoDB');
      process.exit(1);
    }
  }
};

// ==================== MODÈLES SIMPLIFIÉS ====================
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nom: { type: String, required: true },
  prenom: { type: String, required: true },
  role: { type: String, default: 'user' },
  created: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  status: { type: String, default: 'open' },
  priority: { type: String, default: 'medium' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);

// ==================== ROUTES ESSENTIELLES ====================

// Route racine
app.get('/', (req, res) => {
  res.json({
    app: 'Lotato Nova API',
    status: 'online',
    version: '1.0.0',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});

// Health check pour Render
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  res.status(dbStatus === 1 ? 200 : 503).json({
    status: dbStatus === 1 ? 'healthy' : 'unhealthy',
    database: dbStatus === 1 ? 'connected' : 'disconnected'
  });
});

// Test de la base de données
app.get('/test-db', async (req, res) => {
  try {
    // Essayer de compter les utilisateurs pour tester la connexion
    const userCount = await User.countDocuments();
    res.json({
      success: true,
      message: 'Base de données accessible',
      userCount: userCount,
      dbState: mongoose.connection.readyState
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      dbState: mongoose.connection.readyState
    });
  }
});

// Inscription
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, nom, prenom } = req.body;
    
    // Validation simple
    if (!email || !password || !nom || !prenom) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tous les champs sont requis' 
      });
    }
    
    // Vérifier si l'email existe déjà
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cet email est déjà utilisé' 
      });
    }
    
    // Créer l'utilisateur
    const user = new User({
      email,
      password, // Stocké en clair comme demandé
      nom,
      prenom
    });
    
    await user.save();
    
    // Retourner sans le mot de passe
    const userResponse = {
      id: user._id,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      created: user.created
    };
    
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      user: userResponse
    });
    
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors de l\'inscription' 
    });
  }
});

// Connexion
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email et mot de passe requis' 
      });
    }
    
    // Rechercher l'utilisateur
    const user = await User.findOne({ email, password });
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Email ou mot de passe incorrect' 
      });
    }
    
    // Réponse réussie
    const userResponse = {
      id: user._id,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role
    };
    
    res.json({
      success: true,
      message: 'Connexion réussie',
      user: userResponse
    });
    
  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors de la connexion' 
    });
  }
});

// Récupérer tous les utilisateurs
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }); // Exclure les mots de passe
    res.json({
      success: true,
      count: users.length,
      users: users
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Créer un ticket
app.post('/api/tickets', async (req, res) => {
  try {
    const { title, description, category, userId } = req.body;
    
    if (!title || !description || !category || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Données manquantes' 
      });
    }
    
    const ticket = new Ticket({
      title,
      description,
      category,
      userId
    });
    
    await ticket.save();
    
    res.status(201).json({
      success: true,
      message: 'Ticket créé',
      ticket: ticket
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Récupérer tous les tickets
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .populate('userId', 'nom prenom email')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: tickets.length,
      tickets: tickets
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Récupérer un ticket par ID
app.get('/api/tickets/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('userId', 'nom prenom email');
    
    if (!ticket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Ticket non trouvé' 
      });
    }
    
    res.json({
      success: true,
      ticket: ticket
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Mettre à jour un ticket
app.put('/api/tickets/:id', async (req, res) => {
  try {
    const { status } = req.body;
    
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );
    
    if (!ticket) {
      return res.status(404).json({ 
        success: false, 
        error: 'Ticket non trouvé' 
      });
    }
    
    res.json({
      success: true,
      message: 'Ticket mis à jour',
      ticket: ticket
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Route 404
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Route non trouvée' 
  });
});

// ==================== DÉMARRAGE ====================
const startServer = async () => {
  try {
    // Connexion à MongoDB d'abord
    await connectToMongoDB();
    
    // Démarrer le serveur
    server.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 SERVEUR LOTATO NOVA - DÉMARRÉ SUR RENDER');
      console.log('='.repeat(60));
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌍 URL publique: https://lotatonova-fv0b.onrender.com`);
      console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? 'CONNECTÉ ✅' : 'DÉCONNECTÉ ❌'}`);
      console.log(`📁 Base de données: ${mongoose.connection.name || 'N/A'}`);
      console.log(`⏰ Heure: ${new Date().toLocaleString()}`);
      console.log('='.repeat(60));
      console.log('\n📋 Routes disponibles:');
      console.log('  GET  /              - Status de l\'API');
      console.log('  GET  /health        - Health check pour Render');
      console.log('  GET  /test-db       - Test de la base de données');
      console.log('  POST /api/register  - Inscription');
      console.log('  POST /api/login     - Connexion');
      console.log('  GET  /api/users     - Liste des utilisateurs');
      console.log('  POST /api/tickets   - Créer un ticket');
      console.log('  GET  /api/tickets   - Liste des tickets');
      console.log('='.repeat(60) + '\n');
    });
    
  } catch (error) {
    console.error('💥 Impossible de démarrer le serveur:', error);
    process.exit(1);
  }
};

// Gestion de la fermeture
process.on('SIGTERM', async () => {
  console.log('\n🛑 Arrêt du serveur (SIGTERM)...');
  await mongoose.connection.close();
  server.close(() => {
    console.log('👋 Serveur arrêté proprement');
    process.exit(0);
  });
});

// Démarrer
startServer();