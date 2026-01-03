const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const app = express();

/* =======================
   MIDDLEWARES DE BASE
======================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

/* =======================
   CONNEXION MONGODB
======================= */
mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/lottodb', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection
  .once('open', () => console.log('✅ MongoDB connecté'))
  .on('error', () => console.error('❌ Erreur MongoDB'));

/* =======================
   MODELE UTILISATEUR
======================= */
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: {
    type: String,
    enum: ['agent', 'supervisor', 'subsystem', 'master']
  },
  level: { type: Number, default: 1 }
});

const User = mongoose.model('User', userSchema);

/* =======================
   AUTH LOGIN
======================= */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    const user = await User.findOne({ username, password, role });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Accès refusé' });
    }

    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level}`;

    let redirectUrl = '/';
    if (user.role === 'agent') redirectUrl = '/lotato.html';
    if (user.role === 'supervisor' && user.level === 1) redirectUrl = '/control-level1.html';
    if (user.role === 'supervisor' && user.level === 2) redirectUrl = '/control-level2.html';
    if (user.role === 'subsystem') redirectUrl = '/subsystem-admin.html';
    if (user.role === 'master') redirectUrl = '/master-dashboard.html';

    res.json({
      success: true,
      token,
      redirectUrl
    });

  } catch (e) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/* =======================
   MIDDLEWARE TOKEN ROBUSTE
======================= */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  const token = tokenFromHeader || req.query.token;

  if (!token || !token.startsWith('nova_')) {
    return res.redirect('/'); // ⬅️ pas d’erreur bloquante
  }

  req.token = token;
  next();
}

/* =======================
   ROUTES HTML
======================= */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

app.get('/control-level1.html', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/subsystem-admin.html', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

app.get('/master-dashboard.html', verifyToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

/* =======================
   LANCEMENT SERVEUR
======================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur actif sur le port ${PORT}`);
});