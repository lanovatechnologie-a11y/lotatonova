require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS pour production
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting (protection contre les attaques brute force)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limite chaque IP à 100 requêtes par fenêtre
});

// Middlewares essentiels
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// ============================================
// CONFIGURATION DES FICHIERS STATIQUES
// ============================================

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================
// ROUTES POUR CHAQUE PAGE HTML
// ============================================

// Route principale (connexion)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Interface Agent
app.get('/lotato', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'lotato.html'));
});

// Dashboard Master
app.get('/master-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'master-dashboard.html'));
});

// Admin Sous-Système
app.get('/subsystem-admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'subsystem-admin.html'));
});

// Contrôle Niveau 1
app.get('/control-level1', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'control-level1.html'));
});

// Contrôle Niveau 2
app.get('/control-level2', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'control-level2.html'));
});

// Test API
app.get('/test-api', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'test-api.html'));
});

// ============================================
// ROUTES DE REDIRECTION (compatibilité)
// ============================================

// Redirections pour compatibilité avec le code JavaScript existant
app.get('/master-dashboard.html', (req, res) => {
  res.redirect('/master-dashboard');
});

app.get('/subsystem-admin.html', (req, res) => {
  res.redirect('/subsystem-admin');
});

app.get('/control-level1.html', (req, res) => {
  res.redirect('/control-level1');
});

app.get('/control-level2.html', (req, res) => {
  res.redirect('/control-level2');
});

app.get('/lotato.html', (req, res) => {
  res.redirect('/lotato');
});

// ============================================
// ROUTES API
// ============================================

const apiRoutes = [
  { path: '/api/auth', route: require('../routes/auth') },
  { path: '/api/tickets', route: require('../routes/tickets') },
  { path: '/api/users', route: require('../routes/users') }
];

apiRoutes.forEach(route => {
  app.use(route.path, route.route);
});

// Route de vérification de santé
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    environment: process.env.NODE_ENV || 'development',
    supabase: !!process.env.SUPABASE_URL,
    jwt: !!process.env.JWT_SECRET,
    timestamp: new Date().toISOString()
  });
});

// Route test de connexion SIMPLE (pour debug)
app.post('/api/test-login', (req, res) => {
  const { username, password, userType } = req.body;
  
  console.log('Test login attempt:', { username, userType });
  
  // Simulation de succès pour tester
  res.json({
    success: true,
    message: 'Test réussi - Cette route est pour le debug seulement',
    user: { 
      username, 
      name: 'Utilisateur Test',
      type: userType || 'agent'
    },
    token: 'test-token-' + Date.now()
  });
});

// ============================================
// GESTION DES ERREURS
// ============================================

// Gestion des routes non trouvées
app.use((req, res, next) => {
  res.status(404).json({ 
    error: 'Endpoint non trouvé',
    path: req.path,
    method: req.method
  });
});

// Gestion des erreurs centralisée
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err.stack);
  res.status(500).json({
    error: 'Erreur interne du serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log(`🚀 Serveur Nova Lotto démarré sur le port ${PORT}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Supabase: ${process.env.SUPABASE_URL ? 'Connecté' : 'Non configuré'}`);
  console.log(`🔒 JWT: ${process.env.JWT_SECRET ? 'Configuré' : 'Non configuré'}`);
  console.log('📁 Pages disponibles:');
  console.log('  /               → Connexion (index.html)');
  console.log('  /lotato         → Interface Agent');
  console.log('  /master-dashboard → Dashboard Master');
  console.log('  /subsystem-admin  → Admin Sous-Système');
  console.log('  /control-level1   → Contrôle Niveau 1');
  console.log('  /control-level2   → Contrôle Niveau 2');
  console.log('  /test-api       → Test API');
  console.log('='.repeat(50) + '\n');
});

module.exports = app;