js
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 1000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Connexion Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Test de connexion à Supabase
app.get('/ping', async (req, res) => {
  try {
    const { data, error } = await supabase.from('master_users').select().limit(1);
    if (error) throw error;
    res.send('Connexion Supabase OK ✅');
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur de connexion à Supabase ❌');
  }
});

// Autres routes (exemple)
app.get('/', (req, res) => {
  res.send('Serveur actif !');
});

app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});
