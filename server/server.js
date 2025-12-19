require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, '../public')));

// Routes API - CORRECTION DES CHEMINS : ../routes/ au lieu de ./routes/
app.use('/api/auth', require('../routes/auth'));
app.use('/api/tickets', require('../routes/tickets'));
app.use('/api/users', require('../routes/users'));

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    env: {
      supabaseConfigured: !!process.env.SUPABASE_URL,
      jwtConfigured: !!process.env.JWT_SECRET
    }
  });
});

// Route pour toutes les pages HTML (doit être en dernier)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  }
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    error: 'Erreur serveur interne',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Nova Lotto Server running on port ${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Supabase URL: ${process.env.SUPABASE_URL ? 'Configured ✓' : '❌ Not configured'}`);
  console.log(`✅ JWT Secret: ${process.env.JWT_SECRET ? 'Configured ✓' : '❌ Not configured'}`);
  console.log(`${'='.repeat(50)}\n`);
});

module.exports = app;
