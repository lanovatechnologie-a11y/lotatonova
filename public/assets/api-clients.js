class ApiClient {
  constructor() {
    this.baseURL = window.location.origin;
    this.token = localStorage.getItem('auth_token');
  }
  
  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers
      });
      
      if (response.status === 401) {
        // Token expiré
        localStorage.removeItem('auth_token');
        window.location.href = '/login.html';
        return;
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur serveur');
      }
      
      return response.json();
      
    } catch (error) {
      console.error('API Error:', error);
      showNotification(error.message, 'error');
      throw error;
    }
  }
  
  async login(userType, credentials) {
    const response = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ ...credentials, userType })
    });
    
    if (response.success) {
      localStorage.setItem('auth_token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }
    
    return response;
  }
  
  async validateTicket(ticketId) {
    return this.request('/api/tickets/validate', {
      method: 'POST',
      body: JSON.stringify({ ticketId })
    });
  }
  
  async getPendingTickets() {
    return this.request('/api/tickets/pending');
  }
  
  async getAgents() {
    return this.request('/api/users/agents');
  }
  
  async logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  }
}

const apiClient = new ApiClient();

// Fonction utilitaire pour afficher des notifications
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Vérifier l'authentification sur les pages protégées
function checkAuth() {
  const publicPages = ['/login.html'];
  const currentPage = window.location.pathname;
  
  if (publicPages.includes(currentPage)) return;
  
  const token = localStorage.getItem('auth_token');
  if (!token) {
    window.location.href = '/login.html';
  }
}

// Exécuter la vérification au chargement
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAuth);
} else {
  checkAuth();
}
