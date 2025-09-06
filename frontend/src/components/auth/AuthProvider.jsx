// src/components/auth/AuthProvider.jsx - Updated for Supabase backend
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('bankai_token'));
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if token exists and is valid on mount
  useEffect(() => {
    if (token) {
      validateToken();
    }
  }, [token]);

  const getApiUrl = () => {
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:9795';
    }
    return 'https://ec2-44-196-69-226.compute-1.amazonaws.com';
  };

  const validateToken = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${getApiUrl()}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
  
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsAuthenticated(true);
      } else {
        logout();
      }
    } catch (error) {
      console.error('Token validation failed:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = (userData, accessToken) => {
    setUser(userData);
    setToken(accessToken);
    setIsAuthenticated(true);
    localStorage.setItem('bankai_token', accessToken);
    
    // Set token expiration check (optional)
    const tokenExpiry = new Date().getTime() + (60 * 60 * 1000); // 1 hour
    localStorage.setItem('bankai_token_expiry', tokenExpiry.toString());
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem('bankai_token');
    localStorage.removeItem('bankai_token_expiry');
  };

  const isAgent = () => user?.role === 'agent';
  const isCustomer = () => user?.role === 'customer';

  const value = {
    user,
    token,
    loading,
    isAuthenticated,
    login,
    logout,
    isAgent,
    isCustomer,
    setLoading,
    getApiUrl // Export for use in other components
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};