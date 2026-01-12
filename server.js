// server-lotato.js
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// ================== CONFIG ==================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ================== MONGODB ==================
mongoose.connect('mongodb://localhost:27017/lotato', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

console.log('✅ MongoDB Lotato connecté');

// ================== MODELS ==================
const TicketSchema = new mongoose.Schema({
    ticketNumber: Number,
    draw: String,
    draw_time: String,
    bets: Array,
    total: Number,
    agent: String,
    createdAt: { type: Date, default: Date.now }
});

const Ticket = mongoose.model('Ticket', TicketSchema);

const DrawSchema = new mongoose.Schema({
    name: String,
    morning: String,
    evening: String,
    active: Boolean
});

const Draw = mongoose.model('Draw', DrawSchema);

const ResultSchema = new mongoose.Schema({
    draw: String,
    draw_time: String,
    lot1: String,
    lot2: String,
    lot3: String,
    date: Date
});

const Result = mongoose.model('Result', ResultSchema);

// ================== ROUTES LOTATO ==================

// 🔹 Charger les tirages
app.get('/api/lotato/draws', async (req, res) => {
    const draws = await Draw.find({ active: true });
    res.json(draws);
});

// 🔹 Enregistrer un ticket
app.post('/api/lotato/ticket', async (req, res) => {
    try {
        const ticket = new Ticket(req.body);
        await ticket.save();
        res.json({ success: true, ticket });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 🔹 Historique tickets
app.get('/api/lotato/tickets', async (req, res) => {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json(tickets);
});

// 🔹 Publier résultats
app.post('/api/lotato/result', async (req, res) => {
    const result = new Result(req.body);
    await result.save();
    res.json({ success: true });
});

// 🔹 Lire résultats
app.get('/api/lotato/results', async (req, res) => {
    const results = await Result.find().sort({ date: -1 });
    res.json(results);
});

// ================== LOTATO UI ==================
app.get('/lotato', (req, res) => {
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// ================== START ==================
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🎲 Lotato Server actif sur http://localhost:${PORT}`);
});