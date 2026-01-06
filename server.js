const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const fs = require('fs');

const app = express();

// ================= COMPRESSION =================
app.use(compression({
  level: 6,
  threshold: 1024,
}));

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// ================= MONGODB =================
mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/lottodb', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection
  .once('open', () => console.log('✅ MongoDB connecté'))
  .on('error', err => console.error('❌ MongoDB erreur', err));

// ================= SCHEMA =================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['agent', 'supervisor', 'subsystem', 'master'],
    required: true
  },
  level: { type: Number, default: 1 }
});

const User = mongoose.model('User', userSchema);

// ================= LOGIN =================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    const user = await User.findOne({
      username,
      password,
      role,
      deleted: { $exists: false }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants ou rôle incorrect'
      });
    }

    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level}`;

    let redirectUrl;

    switch (user.role) {

      case 'agent':
        redirectUrl = '/lotato.html';
        break;

      // ======= SUPERVISEUR (RÉ-ARRANGÉ ICI SEULEMENT) =======
      case 'supervisor': {
        const level = Number(user.level);

        if (level === 1) {
          redirectUrl = '/control-level1.html';
        } 
        else if (level === 2) {
          redirectUrl = '/control-level2.html';
        } 
        else {
          return res.status(403).json({
            success: false,
            error: 'Niveau superviseur non reconnu'
          });
        }
        break;
      }
      // =====================================================

      case 'subsystem':
        redirectUrl = '/subsystem-admin.html';
        break;

      case 'master':
        redirectUrl = '/master-dashboard.html';
        break;

      default:
        redirectUrl = '/';
    }

    res.json({
      success: true,
      redirectUrl,
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        level: user.level
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// ================= TOKEN =================
function vérifierToken(req, res, next) {
  const { token } = req.query;
  if (!token || !token.startsWith('nova_')) {
    return res.status(401).json({ success: false, error: 'Token invalide' });
  }
  next();
}

// ================= API =================
app.get('/api/system/stats', vérifierToken, async (req, res) => {
  const activeAgents = await User.countDocuments({ role: 'agent' });
  res.json({ success: true, stats: { activeAgents } });
});

app.get('/api/agents', vérifierToken, async (req, res) => {
  const agents = await User.find({ role: 'agent' });
  res.json({ success: true, agents });
});

app.post('/api/agents/create', vérifierToken, async (req, res) => {
  const { email, password, level } = req.body;
  await new User({
    username: email,
    password,
    role: 'agent',
    level
  }).save();
  res.json({ success: true });
});

// ================= HTML =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/lotato.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

app.get('/control-level1.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/subsystem-admin.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

app.get('/master-dashboard.html', vérifierToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

// ================= SERVER =================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur actif sur le port ${PORT}`);
});