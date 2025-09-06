// src/components/auth/CustomerAuth.jsx - Updated for Supabase backend
import React, { useState } from 'react';
import { Mail, User, Eye, EyeOff, Lock, CheckCircle, AlertCircle, Server, Phone } from 'lucide-react';
import { useAuth } from './AuthProvider';

const CustomerAuth = ({ onSwitchToAgent }) => {
  const [isSignup, setIsSignup] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { login, loading, setLoading, getApiUrl } = useAuth();

  const isLocalhost = window.location.hostname === 'localhost';

  const handleSubmit = async () => {
    if (isSignup) {
      if (!formData.name || !formData.email || !formData.password) {
        setError('Please fill in all fields');
        return;
      }
    } else {
      if (!formData.email || !formData.password) {
        setError('Please fill in all fields');
        return;
      }
    }

    if (!isValidEmail(formData.email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (formData.password && formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const apiUrl = getApiUrl();
      
      let endpoint, body;
      
      if (isSignup) {
        console.log('🚀 Customer signup attempt to:', apiUrl);
        endpoint = '/auth/customer/signup';
        body = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password
        };
      } else {
        console.log('🔐 Customer login attempt to:', apiUrl);
        endpoint = '/auth/login';
        body = {
          email: formData.email.trim(),
          password: formData.password
        };
      }

      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      console.log('📥 Customer auth response:', response.status, data);

      if (response.ok) {
        console.log(isSignup ? '✅ Customer signup successful' : '✅ Customer login successful');
        
        // Check if user is actually a customer (for login)
        if (!isSignup && data.user_info.role !== 'customer') {
          setError("This account is not a customer account. Please use agent login.");
          return;
        }
        
        if (isSignup) {
          setSuccess(`Welcome ${formData.name}! Account created successfully.`);
        }
        
        login(data.user_info, data.access_token);
      } else {
        setError(data.detail || (isSignup ? 'Signup failed' : 'Login failed'));
        console.error(isSignup ? '❌ Customer signup failed:' : '❌ Customer login failed:', data);
      }
    } catch (error) {
      setError('Network error. Please check your connection.');
      console.error('❌ Customer auth network error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const fillDemoCredentials = () => {
    if (isSignup) {
      setFormData({
        name: 'Demo Customer',
        email: 'demo.customer@example.com',
        password: 'customer123'
      });
    } else {
      setFormData({
        name: '',
        email: 'demo.customer@example.com',
        password: 'customer123'
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-100">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Phone className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {isSignup ? 'Customer Registration' : 'Customer Support'}
          </h1>
          <p className="text-gray-600">
            {isSignup ? 'Create your customer account' : 'Sign in to get support'}
          </p>

          {/* Connection indicator */}
          <div className={`mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
            isLocalhost
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-green-100 text-green-800'
          }`}>
            <Server className="w-3 h-3 mr-1" />
            {isLocalhost ? 'DEVELOPMENT' : 'EC2 DEPLOYED'}
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-6 flex items-center">
            <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" />
            <span className="text-green-700 text-sm">{success}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-4 mb-6">
          {isSignup && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onKeyPress={handleKeyPress}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 outline-none text-gray-900 placeholder-gray-500"
                  placeholder="Enter your full name"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                onKeyPress={handleKeyPress}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 outline-none text-gray-900 placeholder-gray-500"
                placeholder="Enter your email address"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                onKeyPress={handleKeyPress}
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 outline-none text-gray-900 placeholder-gray-500"
                placeholder="Enter your password"
                disabled={loading}
                minLength="6"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {isSignup && (
              <p className="text-xs text-gray-500 mt-1">
                Password must be at least 6 characters long
              </p>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={loading || !formData.email || !formData.password || (isSignup && !formData.name)}
          className="w-full bg-gradient-to-r from-green-500 to-teal-600 text-white py-3 rounded-xl font-medium hover:from-green-600 hover:to-teal-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-6"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              {isSignup ? 'Creating Account...' : 'Signing In...'}
            </div>
          ) : (
            isSignup ? 'Create Account & Connect' : 'Sign In'
          )}
        </button>

        {/* Demo Credentials */}
        {(isLocalhost || window.location.host.includes('ec2-')) && (
          <div className="bg-green-50 rounded-lg border border-green-200 p-4 mb-6">
            <p className="text-sm text-green-800 font-medium mb-3">
              Demo Credentials:
            </p>
            <button
              onClick={fillDemoCredentials}
              className="w-full text-left p-2 bg-white rounded border border-green-200 hover:bg-green-50 transition-colors"
              disabled={loading}
            >
              <div className="text-xs text-green-600">
                <div className="font-medium">Demo Customer</div>
                <div>Email: demo.customer@example.com • Password: customer123</div>
              </div>
            </button>
          </div>
        )}

        {/* Toggle Signup/Login */}
        <div className="text-center mb-6">
          <button
            onClick={() => {
              setIsSignup(!isSignup);
              setError('');
              setSuccess('');
              setFormData({ name: '', email: '', password: '' });
            }}
            className="text-green-600 hover:text-green-700 font-medium transition-colors text-sm"
            disabled={loading}
          >
            {isSignup ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
          </button>
        </div>

        {/* Connection Info */}
        <div className="bg-gray-50 rounded-lg p-3 mb-6">
          <div className="text-xs text-gray-600">
            <div className="font-medium">Connecting to:</div>
            <div className="font-mono text-gray-800 break-all">
              {getApiUrl()}
            </div>
            {!isLocalhost && (
              <div className="text-xs text-green-600 mt-1">
                ✅ Connected to EC2 instance
              </div>
            )}
          </div>
        </div>

        {/* Switch to Agent */}
        <div className="text-center">
          <p className="text-gray-600 text-sm">
            Are you a support agent?{' '}
            <button
              onClick={onSwitchToAgent}
              className="text-green-600 hover:text-green-700 font-medium transition-colors"
              disabled={loading}
            >
              Agent Login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default CustomerAuth;