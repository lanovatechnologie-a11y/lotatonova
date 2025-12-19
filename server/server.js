require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

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

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, '../public')));

// Routes API
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
    jwt: !!process.env.JWT_SECRET
  });
});

// Gestion des routes non trouvées
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint non trouvé' });
});

// Gestion des erreurs centralisée
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err.stack);
  res.status(500).json({
    error: 'Erreur interne du serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log(`🚀 Serveur Nova Lotto démarré sur le port ${PORT}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Supabase: ${process.env.SUPABASE_URL ? 'Connecté' : 'Non configuré'}`);
  console.log(`🔒 JWT: ${process.env.JWT_SECRET ? 'Configuré' : 'Non configuré'}`);
  console.log('='.repeat(50) + '\n');
});

module.exports = app;
