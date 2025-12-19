class ApiClient {
  constructor() {
    this.baseURL = window.location.origin;
    this.token = null;
    this.user = null;
    
    // Charger depuis sessionStorage au lieu de localStorage
    this.loadSession();
  }
  
  loadSession() {
    try {
      const token = sessionStorage.getItem('auth_token');
      const user = sessionStorage.getItem('user');
      
      if (token) this.token = token;
      if (user) this.user = JSON.parse(user);
    } catch (e) {
      console.error('Session load error:', e);
    }
  }
  
  saveSession(token, user) {
    this.token = token;
    this.user = user;
    sessionStorage.setItem('auth_token', token);
    sessionStorage.setItem('user', JSON.stringify(user));
  }
  
  clearSession() {
    this.token = null;
    this.user = null;
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('user');
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
        this.clearSession();
        window.location.href = '/login.html';
        return;
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Erreur serveur');
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
    
    if (response.success && response.token) {
      this.saveSession(response.token, response.user);
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
  
  async createTicket(ticketData) {
    return this.request('/api/tickets/create', {
      method: 'POST',
      body: JSON.stringify(ticketData)
    });
  }
  
  async getProfile() {
    return this.request('/api/users/profile');
  }
  
  async logout() {
    this.clearSession();
    window.location.href = '/login.html';
  }
  
  isAuthenticated() {
    return !!this.token;
  }
  
  getUser() {
    return this.user;
  }
}

const apiClient = new ApiClient();