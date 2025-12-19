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
    
    // Validation
    if (!ticketId) {
      return res.status(400).json({ error: 'ticketId est requis' });
    }
    
    // Vérifier les permissions
    if (!['supervisor1', 'supervisor2', 'subsystem', 'master'].includes(userRole)) {
      return res.status(403).json({ 
        error: 'Permission refusée',
        message: 'Seuls les superviseurs peuvent valider des tickets' 
      });
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
      console.error('Ticket validation error:', error);
      return res.status(400).json({ 
        error: 'Erreur de validation',
        details: error.message 
      });
    }
    
    if (!data || data.length === 0) {
      return res.status(404).json({ 
        error: 'Ticket non trouvé ou déjà validé' 
      });
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
    res.status(500).json({ 
      error: 'Erreur serveur',
      message: error.message 
    });
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
      .select(`
        *,
        agents(id, username, full_name, phone),
        subsystems(id, name)
      `)
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
    
    if (error) {
      console.error('Get pending tickets error:', error);
      return res.status(400).json({ 
        error: 'Erreur de récupération',
        details: error.message 
      });
    }
    
    res.json({ 
      success: true,
      tickets: data || [],
      count: data ? data.length : 0
    });
    
  } catch (error) {
    console.error('Get pending tickets error:', error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      message: error.message 
    });
  }
});

// Créer un nouveau ticket (pour agents)
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { amount, ticket_number } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Seuls les agents peuvent créer des tickets
    if (userRole !== 'agent') {
      return res.status(403).json({ 
        error: 'Permission refusée',
        message: 'Seuls les agents peuvent créer des tickets' 
      });
    }
    
    // Validation
    if (!amount || !ticket_number) {
      return res.status(400).json({ error: 'Données manquantes' });
    }
    
    // Calculer la commission (exemple: 10%)
    const commission = parseFloat(amount) * 0.10;
    
    // Récupérer les infos de l'agent pour avoir ses superviseurs
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select(`
        *,
        supervisors_level1(
          id,
          supervisor2_id,
          supervisors_level2(
            id,
            subsystem_id
          )
        )
      `)
      .eq('id', userId)
      .single();
    
    if (agentError || !agent) {
      return res.status(400).json({ error: 'Agent non trouvé' });
    }
    
    // Créer le ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        agent_id: userId,
        supervisor1_id: agent.supervisor1_id,
        supervisor2_id: agent.supervisors_level1?.supervisor2_id,
        subsystem_id: agent.supervisors_level1?.supervisors_level2?.subsystem_id,
        ticket_number,
        amount: parseFloat(amount),
        commission,
        status: 'pending'
      })
      .select()
      .single();
    
    if (ticketError) {
      console.error('Create ticket error:', ticketError);
      return res.status(400).json({ error: ticketError.message });
    }
    
    // Enregistrer l'activité
    await supabase
      .from('activities')
      .insert({
        user_id: userId,
        action: 'ticket_creation',
        details: `Ticket ${ticket_number} créé - Montant: ${amount}`,
        ip_address: req.ip
      });
    
    res.json({ 
      success: true,
      message: 'Ticket créé avec succès',
      ticket 
    });
    
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      message: error.message 
    });
  }
});

module.exports = router;