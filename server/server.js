require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(limiter);

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, '../public')));

// Routes API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/users', require('./routes/users'));

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Route pour toutes les pages HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`✅ Nova Lotto Server running on port ${PORT}`);
  console.log(`✅ Supabase URL: ${process.env.SUPABASE_URL ? 'Configured' : 'Not configured'}`);
});
