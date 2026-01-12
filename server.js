// server.js – Lotato (Render OK)

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// ================= CONFIG =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ================= MONGODB =================
const MONGO_URI = process.env["MONGODB-URL"];

if (!MONGO_URI) {
    console.error("❌ Variable MONGODB-URL introuvable dans Render");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Atlas connecté"))
    .catch(err => {
        console.error("❌ Erreur MongoDB :", err.message);
        process.exit(1);
    });

// ================= MODELS =================
const Ticket = mongoose.model('Ticket', new mongoose.Schema({
    ticketNumber: Number,
    draw: String,
    draw_time: String,
    bets: Array,
    total: Number,
    agent: String,
    createdAt: { type: Date, default: Date.now }
}));

const Draw = mongoose.model('Draw', new mongoose.Schema({
    name: String,
    morning: String,
    evening: String,
    active: Boolean
}));

const Result = mongoose.model('Result', new mongoose.Schema({
    draw: String,
    draw_time: String,
    lot1: String,
    lot2: String,
    lot3: String,
    date: { type: Date, default: Date.now }
}));

// ================= ROUTES LOTATO =================
app.get('/api/lotato/draws', async (req, res) => {
    res.json(await Draw.find({ active: true }));
});

app.post('/api/lotato/ticket', async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.json({ success: true, ticket });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/lotato/tickets', async (req, res) => {
    res.json(await Ticket.find().sort({ createdAt: -1 }));
});

app.post('/api/lotato/result', async (req, res) => {
    await new Result(req.body).save();
    res.json({ success: true });
});

app.get('/api/lotato/results', async (req, res) => {
    res.json(await Result.find().sort({ date: -1 }));
});

// ================= UI =================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🎲 Lotato actif sur le port ${PORT}`);
});