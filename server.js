const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

const app = express();

// Middleware de sécurité
app.use(helmet());

// Middleware de logging
app.use(morgan('combined'));

// Middleware de compression
app.use(compression());

// Middleware CORS
app.use(cors());

// Middleware pour parser le JSON
app.use(express.json());

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Importer les routes d'authentification
const authRoutes = require('./server/routes/auth');
app.use('/api/auth', authRoutes);

// Route de test API
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'API Nova Lotto fonctionne!',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Routes pour les pages HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/master', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'master.html'));
});

app.get('/subsystem', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'subsystem.html'));
});

app.get('/supervisor1', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'supervisor1.html'));
});

app.get('/supervisor2', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'supervisor2.html'));
});

app.get('/agent', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'agent.html'));
});

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Route non trouvée',
        path: req.path,
        method: req.method 
    });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    res.status(500).json({ 
        error: 'Erreur interne du serveur',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
    });
});

// Port d'écoute
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur Nova Lotto démarré sur le port ${PORT}`);
    console.log(`📊 Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
});
