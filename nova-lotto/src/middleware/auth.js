const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            error: 'Token manquant',
            message: 'Authentification requise' 
        });
    }
    
    if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET is not configured');
        return res.status(500).json({ error: 'Configuration serveur incorrecte' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT verification failed:', err.message);
            return res.status(403).json({ 
                error: 'Token invalide',
                message: 'Veuillez vous reconnecter' 
            });
        }
        req.user = user;
        next();
    });
}

module.exports = authenticateToken;