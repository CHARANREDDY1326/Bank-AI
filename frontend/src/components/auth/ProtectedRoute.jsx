// src/components/auth/ProtectedRoute.jsx
import React, { useState } from 'react';
import { Shield, User, AlertTriangle } from 'lucide-react';
import { useAuth } from './AuthProvider';
import AgentLogin from './AgentLogin';
import CustomerAuth from './CustomerAuth';

// Main Auth Screen Component
const AuthScreen = () => {
  const [userType, setUserType] = useState('customer'); // 'agent' or 'customer'

  return userType === 'agent' ? (
    <AgentLogin onSwitchToCustomer={() => setUserType('customer')} />
  ) : (
    <CustomerAuth onSwitchToAgent={() => setUserType('agent')} />
  );
};

// Loading Screen Component
const LoadingScreen = () => (
  <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
    <div className="text-center">
      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading...</h2>
      <p className="text-gray-600">Verifying your credentials</p>
    </div>
  </div>
);

// Access Denied Component
const AccessDenied = ({ userRole, requiredRole, onLogout }) => (
  <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-100 text-center">
      <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-8 h-8 text-white" />
      </div>
      
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
      <p className="text-gray-600 mb-6">
        You don't have permission to access this page.
      </p>
      
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-red-600">Your Role:</span>
          <span className="font-medium text-red-800 capitalize">{userRole}</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-red-600">Required Role:</span>
          <span className="font-medium text-red-800 capitalize">{requiredRole}</span>
        </div>
      </div>
      
      <button
        onClick={onLogout}
        className="w-full bg-gradient-to-r from-red-500 to-orange-600 text-white py-3 rounded-xl font-medium hover:from-red-600 hover:to-orange-700 transition-all duration-200"
      >
        Sign Out & Switch Account
      </button>
    </div>
  </div>
);

// Main Protected Route Component
const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { user, token, loading, isAuthenticated, logout } = useAuth();

  // Show loading screen while validating token
  if (loading) {
    return <LoadingScreen />;
  }

  // Show auth screen if not authenticated
  if (!token || !isAuthenticated || !user) {
    return <AuthScreen />;
  }

  // Check role-based access
  if (requiredRole && user.role !== requiredRole) {
    return (
      <AccessDenied 
        userRole={user.role} 
        requiredRole={requiredRole} 
        onLogout={logout}
      />
    );
  }

  // User is authenticated and has correct role
  return children;
};

// Specific role-based route components for convenience
export const AgentRoute = ({ children }) => (
  <ProtectedRoute requiredRole="agent">
    {children}
  </ProtectedRoute>
);

export const CustomerRoute = ({ children }) => (
  <ProtectedRoute requiredRole="customer">
    {children}
  </ProtectedRoute>
);

// User info display component
export const UserInfo = ({ className = "" }) => {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
        user.role === 'agent' ? 'bg-blue-500' : 'bg-green-500'
      }`}>
        {user.role === 'agent' ? (
          <Shield className="w-4 h-4 text-white" />
        ) : (
          <User className="w-4 h-4 text-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 truncate">
          {user.role === 'agent' ? user.username : user.name}
        </p>
        <p className="text-xs text-gray-500 capitalize">{user.role}</p>
      </div>
      <button
        onClick={logout}
        className="text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors"
      >
        Logout
      </button>
    </div>
  );
};

export default ProtectedRoute;