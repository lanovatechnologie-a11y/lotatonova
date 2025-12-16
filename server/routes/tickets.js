const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');

// Valider un ticket (pour superviseurs)
router.post('/validate', authMiddleware, async (req, res) => {
  try {
    const { ticketId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Vérifier les permissions
    if (!['supervisor1', 'supervisor2', 'subsystem', 'master'].includes(userRole)) {
      return res.status(403).json({ error: 'Permission refusée' });
    }
    
    // Mettre à jour le ticket
    const { data, error } = await supabase
      .from('tickets')
      .update({ 
        status: 'validated',
        validated_by: userId,
        validated_at: new Date().toISOString()
      })
      .eq('id', ticketId)
      .eq('status', 'pending')
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    if (data.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé ou déjà validé' });
    }
    
    // Enregistrer l'activité
    await supabase
      .from('activities')
      .insert({
        user_id: userId,
        action: 'ticket_validation',
        details: `Ticket ${ticketId} validé`,
        ip_address: req.ip
      });
    
    res.json({ 
      success: true, 
      message: 'Ticket validé avec succès',
      ticket: data[0]
    });
    
  } catch (error) {
    console.error('Ticket validation error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Obtenir les tickets en attente
router.get('/pending', authMiddleware, async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;
    const subsystemId = req.user.subsystem_id;
    
    let query = supabase
      .from('tickets')
      .select('*, agents(name, phone), subsystems(name)')
      .eq('status', 'pending');
    
    // Filtres selon le rôle
    if (userRole === 'supervisor1') {
      query = query.eq('supervisor1_id', userId);
    } else if (userRole === 'supervisor2') {
      query = query.eq('supervisor2_id', userId);
    } else if (userRole === 'subsystem') {
      query = query.eq('subsystem_id', subsystemId);
    }
    // Master peut tout voir
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ tickets: data });
    
  } catch (error) {
    console.error('Get pending tickets error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
