// server.js - Serveur complet Lotato avec MongoDB Atlas
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variables d'environnement
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster.mongodb.net/lotato';
const PORT = process.env.PORT || 5000;

// Connexion MongoDB Atlas
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  socketTimeoutMS: 45000,
})
.then(() => console.log('✅ MongoDB Atlas connecté'))
.catch(err => {
  console.error('❌ Erreur MongoDB:', err);
  process.exit(1);
});

// ==================== SCHÉMAS & MODÈLES ====================

// Modèle Utilisateur
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Sans hachage comme demandé
  nom: { type: String, required: true },
  prenom: { type: String, required: true },
  role: { type: String, enum: ['admin', 'utilisateur', 'moderateur'], default: 'utilisateur' },
  date_inscription: { type: Date, default: Date.now },
  derniere_connexion: { type: Date },
  actif: { type: Boolean, default: true },
  preferences: {
    theme: { type: String, default: 'clair' },
    notifications: { type: Boolean, default: true }
  }
});

// Modèle Ticket/Problème
const ticketSchema = new mongoose.Schema({
  titre: { type: String, required: true },
  description: { type: String, required: true },
  categorie: { type: String, enum: ['bug', 'amelioration', 'question', 'urgent'], required: true },
  statut: { type: String, enum: ['ouvert', 'en_cours', 'resolu', 'ferme'], default: 'ouvert' },
  priorite: { type: String, enum: ['basse', 'moyenne', 'haute', 'critique'], default: 'moyenne' },
  createur_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assigne_a: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date_creation: { type: Date, default: Date.now },
  date_modification: { type: Date, default: Date.now },
  date_resolution: { type: Date },
  commentaires: [{
    auteur_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    contenu: { type: String, required: true },
    date: { type: Date, default: Date.now }
  }],
  pieces_jointes: [{
    nom: String,
    url: String,
    type: String,
    taille: Number
  }]
});

// Modèle Projet
const projetSchema = new mongoose.Schema({
  nom: { type: String, required: true },
  description: { type: String },
  createur_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  membres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  date_creation: { type: Date, default: Date.now },
  tickets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' }]
});

// Modèle Notification
const notificationSchema = new mongoose.Schema({
  utilisateur_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['ticket', 'commentaire', 'assignation', 'systeme'] },
  titre: { type: String, required: true },
  message: { type: String, required: true },
  lu: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
  lien: { type: String }
});

// Création des modèles
const User = mongoose.model('User', userSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const Projet = mongoose.model('Projet', projetSchema);
const Notification = mongoose.model('Notification', notificationSchema);

// ==================== MIDDLEWARE D'AUTHENTIFICATION ====================
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Token manquant' });
    }
    
    // Format: "Bearer email:password" (base64)
    const token = authHeader.split(' ')[1];
    const credentials = Buffer.from(token, 'base64').toString();
    const [email, password] = credentials.split(':');
    
    const user = await User.findOne({ email, password });
    if (!user) {
      return res.status(401).json({ error: 'Authentification échouée' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentification invalide' });
  }
};

// ==================== ROUTES UTILISATEURS ====================

// Inscription
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, nom, prenom } = req.body;
    
    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }
    
    const user = new User({
      email,
      password, // Stocké en clair
      nom,
      prenom
    });
    
    await user.save();
    
    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      user: {
        id: user._id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Connexion
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email, password });
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    // Mettre à jour la dernière connexion
    user.derniere_connexion = new Date();
    await user.save();
    
    // Créer un token simple (email:password en base64)
    const token = Buffer.from(`${email}:${password}`).toString('base64');
    
    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer le profil utilisateur
app.get('/api/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mettre à jour le profil
app.put('/api/profile', authenticate, async (req, res) => {
  try {
    const updates = req.body;
    delete updates.password; // Empêcher la modification du mot de passe via cette route
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');
    
    res.json({
      message: 'Profil mis à jour',
      user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Changer le mot de passe
app.post('/api/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user._id);
    
    // Vérifier l'ancien mot de passe (en clair)
    if (user.password !== currentPassword) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }
    
    // Mettre à jour avec le nouveau mot de passe (en clair)
    user.password = newPassword;
    await user.save();
    
    res.json({ message: 'Mot de passe changé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ROUTES TICKETS ====================

// Créer un ticket
app.post('/api/tickets', authenticate, async (req, res) => {
  try {
    const ticketData = {
      ...req.body,
      createur_id: req.user._id
    };
    
    const ticket = new Ticket(ticketData);
    await ticket.save();
    
    // Notifier les administrateurs
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      const notification = new Notification({
        utilisateur_id: admin._id,
        type: 'ticket',
        titre: 'Nouveau ticket',
        message: `Un nouveau ticket a été créé par ${req.user.prenom} ${req.user.nom}`,
        lien: `/tickets/${ticket._id}`
      });
      await notification.save();
    }
    
    res.status(201).json({
      message: 'Ticket créé avec succès',
      ticket
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lister tous les tickets
app.get('/api/tickets', authenticate, async (req, res) => {
  try {
    let query = {};
    const { statut, categorie, priorite, assigne } = req.query;
    
    // Filtres
    if (statut) query.statut = statut;
    if (categorie) query.categorie = categorie;
    if (priorite) query.priorite = priorite;
    if (assigne) query.assigne_a = assigne;
    
    // Si l'utilisateur n'est pas admin, voir seulement ses tickets ou ceux assignés
    if (req.user.role !== 'admin') {
      query.$or = [
        { createur_id: req.user._id },
        { assigne_a: req.user._id }
      ];
    }
    
    const tickets = await Ticket.find(query)
      .populate('createur_id', 'nom prenom email')
      .populate('assigne_a', 'nom prenom email')
      .sort({ date_creation: -1 });
    
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer un ticket spécifique
app.get('/api/tickets/:id', authenticate, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('createur_id', 'nom prenom email')
      .populate('assigne_a', 'nom prenom email')
      .populate('commentaires.auteur_id', 'nom prenom email');
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    
    // Vérifier les permissions
    if (req.user.role !== 'admin' && 
        ticket.createur_id._id.toString() !== req.user._id.toString() &&
        (!ticket.assigne_a || ticket.assigne_a._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mettre à jour un ticket
app.put('/api/tickets/:id', authenticate, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    
    // Vérifier les permissions
    if (req.user.role !== 'admin' && 
        ticket.createur_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const updates = req.body;
    updates.date_modification = new Date();
    
    // Si le statut passe à "résolu", enregistrer la date
    if (updates.statut === 'resolu' && ticket.statut !== 'resolu') {
      updates.date_resolution = new Date();
    }
    
    const updatedTicket = await Ticket.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    
    res.json({
      message: 'Ticket mis à jour',
      ticket: updatedTicket
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ajouter un commentaire
app.post('/api/tickets/:id/comments', authenticate, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    
    const commentaire = {
      auteur_id: req.user._id,
      contenu: req.body.contenu,
      date: new Date()
    };
    
    ticket.commentaires.push(commentaire);
    ticket.date_modification = new Date();
    await ticket.save();
    
    // Notifier le créateur du ticket et la personne assignée
    const notifications = [];
    
    if (ticket.createur_id.toString() !== req.user._id.toString()) {
      const notification = new Notification({
        utilisateur_id: ticket.createur_id,
        type: 'commentaire',
        titre: 'Nouveau commentaire',
        message: `${req.user.prenom} a commenté votre ticket "${ticket.titre}"`,
        lien: `/tickets/${ticket._id}`
      });
      notifications.push(notification.save());
    }
    
    if (ticket.assigne_a && ticket.assigne_a.toString() !== req.user._id.toString()) {
      const notification = new Notification({
        utilisateur_id: ticket.assigne_a,
        type: 'commentaire',
        titre: 'Nouveau commentaire',
        message: `${req.user.prenom} a commenté le ticket "${ticket.titre}"`,
        lien: `/tickets/${ticket._id}`
      });
      notifications.push(notification.save());
    }
    
    await Promise.all(notifications);
    
    res.json({
      message: 'Commentaire ajouté',
      commentaire
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ROUTES PROJETS ====================

// Créer un projet
app.post('/api/projets', authenticate, async (req, res) => {
  try {
    const projetData = {
      ...req.body,
      createur_id: req.user._id,
      membres: [req.user._id] // Ajouter le créateur comme membre
    };
    
    const projet = new Projet(projetData);
    await projet.save();
    
    res.status(201).json({
      message: 'Projet créé',
      projet
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lister les projets
app.get('/api/projets', authenticate, async (req, res) => {
  try {
    const projets = await Projet.find({
      $or: [
        { createur_id: req.user._id },
        { membres: req.user._id }
      ]
    })
    .populate('createur_id', 'nom prenom')
    .populate('membres', 'nom prenom email');
    
    res.json(projets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ROUTES NOTIFICATIONS ====================

// Récupérer les notifications
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const notifications = await Notification.find({
      utilisateur_id: req.user._id
    })
    .sort({ date: -1 })
    .limit(50);
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marquer une notification comme lue
app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, utilisateur_id: req.user._id },
      { lu: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification non trouvée' });
    }
    
    res.json({ message: 'Notification marquée comme lue', notification });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marquer toutes les notifications comme lues
app.put('/api/notifications/read-all', authenticate, async (req, res) => {
  try {
    await Notification.updateMany(
      { utilisateur_id: req.user._id, lu: false },
      { lu: true }
    );
    
    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ROUTES ADMIN ====================

// Récupérer tous les utilisateurs (admin seulement)
app.get('/api/admin/users', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Statistiques (admin seulement)
app.get('/api/admin/stats', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    
    const stats = {
      totalUsers: await User.countDocuments(),
      activeUsers: await User.countDocuments({ actif: true }),
      totalTickets: await Ticket.countDocuments(),
      openTickets: await Ticket.countDocuments({ statut: 'ouvert' }),
      resolvedTickets: await Ticket.countDocuments({ statut: 'resolu' }),
      totalProjects: await Projet.countDocuments()
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
  console.log('Nouvelle connexion Socket.io');
  
  socket.on('join-ticket', (ticketId) => {
    socket.join(`ticket-${ticketId}`);
  });
  
  socket.on('new-comment', (data) => {
    io.to(`ticket-${data.ticketId}`).emit('comment-added', data.comment);
  });
  
  socket.on('ticket-updated', (data) => {
    io.emit('ticket-changed', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Déconnexion Socket.io');
  });
});

// ==================== ROUTES UTILITAIRES ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Route de test
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API Lotato fonctionnelle',
    version: '1.0.0',
    date: new Date().toISOString()
  });
});

// Gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Gestion globale des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur:', err.stack);
  res.status(500).json({ 
    error: 'Erreur interne du serveur',
    message: err.message 
  });
});

// ==================== DÉMARRAGE DU SERVEUR ====================
server.listen(PORT, () => {
  console.log(`🚀 Serveur Lotato démarré sur le port ${PORT}`);
  console.log(`📡 MongoDB: ${mongoose.connection.host}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
});

// Fermeture propre
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('⏏️ Déconnexion de MongoDB');
  server.close(() => {
    console.log('👋 Serveur arrêté');
    process.exit(0);
  });
});