js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 1000;

// Connexion à Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Pour servir les fichiers HTML, CSS, JS

// Exemple de route test pour vérifier la connexion à Supabase
app.get('/test-connection', async (req, res) => {
  try {
    const { data, error } = await supabase.from('test_table').select('*').limit(1);
    if (error) throw error;
    res.json({ connected: true, data });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// Fallback vers index.html pour les routes inconnues (si tu fais du SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`Serveur en ligne sur le port ${port}`);
});
