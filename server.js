const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// FICHIERS STATIQUES
app.use(express.static(__dirname));

// PAGE LOGIN
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// AGENT
app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

// SUPERVISEUR NIVEAU 1
app.get('/control-level1.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level1.html'));
});

// SOUS-SYSTEME
app.get('/subsystem-admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

// MASTER (si existe)
app.get('/master-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

// LANCEMENT SERVEUR
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('🚀 Serveur lancé sur le port ' + PORT);
});