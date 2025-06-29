// src/components/auth/CustomerAuth.jsx - No Domain Version
import React, { useState, useEffect } from 'react';
import { Mail, User, Phone, CheckCircle, AlertCircle, ArrowLeft, Server } from 'lucide-react';
import { useAuth } from './AuthProvider';



const CustomerAuth = ({ onSwitchToAgent }) => {
// Initialize state with localStorage data
const getInitialState = () => {
  try {
    const saved = localStorage.getItem('customerAuthState');
    if (saved) {
      const parsed = JSON.parse(saved);
      console.log('🔍 Initializing with saved state:', parsed);
      return parsed;
    }
  } catch (e) {
    console.error('Error loading initial state:', e);
  }
  return { step: 'signup', formData: { email: '', name: '', code: '' }, success: '' };
};

const initialState = getInitialState();
  const [step, setStep] = useState(initialState.step);
  const [formData, setFormData] = useState(initialState.formData);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(initialState.success);
  const { login, loading, setLoading } = useAuth();
  
  console.log('🏗️ CustomerAuth component rendering/mounting');
  console.log('🔍 Current step state:', step);
  console.log('🔍 Current formData state:', formData);

  // Component lifecycle debugging
  useEffect(() => {
    console.log('🚀 CustomerAuth component mounted');
    return () => {
      console.log('🛑 CustomerAuth component unmounting');
    };
  }, []);

  // Replace the getApiUrl function with:
  const getApiUrl = () => {
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:9795';
    }
    // Your FIXED Elastic IP hostname
    return 'https://ec2-44-196-69-226.compute-1.amazonaws.com';
  };

  const isLocalhost = window.location.hostname === 'localhost';

  // Persist state changes to localStorage
  useEffect(() => {
    localStorage.setItem('customerAuthState', JSON.stringify({ step, formData, success }));
  }, [step, formData, success]);

  // Debug step changes
  useEffect(() => {
    console.log('🔄 Step changed to:', step);
  }, [step]);

  const handleSignup = async () => {
    console.log('🎯 handleSignup called');
    console.log('🔍 Current formData:', formData);
    
    if (!formData.email || !formData.name) {
      setError('Please fill in all fields');
      return;
    }

    if (!isValidEmail(formData.email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const apiUrl = getApiUrl();
      console.log('🚀 Sending customer signup request to:', apiUrl);

      const response = await fetch(`${apiUrl}/auth/customer/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: formData.email.trim(),
          name: formData.name.trim()
        })
      });

      const data = await response.json();
      console.log('📥 Customer signup response:', response.status, data);
      console.log('📥 Response OK status:', response.ok);

      if (response.ok) {
        console.log('✅ Customer signup successful');
        console.log('🔄 About to set success message and step');
        console.log('🔍 Current step before update:', step);

        setSuccess(`Verification code sent to ${formData.email}! Check your terminal for the code.`);
        
        console.log('🔄 About to call setStep(verify)');
        setStep('verify');
        console.log('🔄 setStep(verify) called');
        console.log('🔍 Step should now be "verify"');

      } else {
        console.log('❌ Response not OK, status:', response.status);
        setError(data.detail || 'Signup failed');
        console.error('❌ Customer signup failed:', data);
      }
    } catch (error) {
      console.log('❌ Caught error in handleSignup:', error);
      setError('Network error. Please check your connection.');
      console.error('❌ Customer signup network error:', error);
    } finally {
      console.log('🔄 Setting loading to false');
      setLoading(false);
    }
  };

  const handleVerification = async () => {
    if (!formData.code || formData.code.length !== 6) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    if (!formData.email) {
      setError('Email missing. Please go back and signup again.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const apiUrl = getApiUrl();
      console.log('🔐 Verifying customer code at:', apiUrl);

      const response = await fetch(`${apiUrl}/auth/customer/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: formData.email,
          code: formData.code
        })
      });

      const data = await response.json();
      console.log('📥 Customer verification response:', response.status, data);

      if (response.ok) {
        console.log('✅ Customer verification successful');
        // Clear localStorage after successful login
        localStorage.removeItem('customerAuthState');
        login(data.user_info, data.access_token);
      } else {
        setError(data.detail || 'Verification failed');
        console.error('❌ Customer verification failed:', data);
      }
    } catch (error) {
      setError('Network error. Please check your connection.');
      console.error('❌ Customer verification network error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (step === 'signup') {
        handleSignup();
      } else {
        handleVerification();
      }
    }
  };

  const handleBackToSignup = () => {
    console.log('🔙 Going back to signup');
    setStep('signup');
    setError('');
    setSuccess('');
    setFormData({ ...formData, code: '' });
  };

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setFormData({ ...formData, code: value });
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
            {step === 'signup' ? 'Customer Support' : 'Verify Your Email'}
          </h1>
          <p className="text-gray-600">
            {step === 'signup'
              ? 'Get connected with our support team'
              : `Enter the code sent to ${formData.email}`
            }
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

        {step === 'signup' ? (
          <div>
            <div className="space-y-4 mb-6">
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

              <button
                onClick={handleSignup}
                disabled={loading || !formData.name || !formData.email}
                className="w-full bg-gradient-to-r from-green-500 to-teal-600 text-white py-3 rounded-xl font-medium hover:from-green-600 hover:to-teal-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Sending Code...
                  </div>
                ) : (
                  'Send Verification Code'
                )}
              </button>

              {/* Temporary debug button */}
              <button
                onClick={() => {
                  console.log('🔧 Debug: Manually setting step to verify');
                  setStep('verify');
                  setSuccess('Debug: Manual step change');
                }}
                className="w-full bg-yellow-500 text-white py-2 rounded-lg text-sm mt-2"
              >
                Debug: Force Step to Verify
              </button>

              {/* Clear localStorage debug button */}
              <button
                onClick={() => {
                  console.log('🧹 Debug: Clearing localStorage');
                  localStorage.removeItem('customerAuthState');
                  setStep('signup');
                  setFormData({ email: '', name: '', code: '' });
                  setSuccess('');
                  setError('');
                }}
                className="w-full bg-red-500 text-white py-2 rounded-lg text-sm mt-2"
              >
                Debug: Clear localStorage
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={handleCodeChange}
                  onKeyPress={handleKeyPress}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200 text-center text-2xl font-mono tracking-widest outline-none text-gray-900 placeholder-gray-400"
                  placeholder="000000"
                  maxLength="6"
                  disabled={loading}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1 text-center">
                  Enter the 6-digit code from your terminal
                </p>
              </div>

              <div className="text-center text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                Code sent to: <span className="font-medium text-gray-800">{formData.email}</span>
              </div>

              <button
                onClick={handleVerification}
                disabled={loading || formData.code.length !== 6}
                className="w-full bg-gradient-to-r from-green-500 to-teal-600 text-white py-3 rounded-xl font-medium hover:from-green-600 hover:to-teal-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Verifying...
                  </div>
                ) : (
                  'Verify & Connect'
                )}
              </button>

              <button
                onClick={handleBackToSignup}
                disabled={loading}
                className="w-full flex items-center justify-center text-gray-600 hover:text-gray-800 py-2 text-sm transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to signup
              </button>
            </div>
          </div>
        )}

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

        {/* Debug Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
          <div className="text-xs text-blue-600">
            <div className="font-medium">Debug Info:</div>
            <div>Current Step: <span className="font-mono">{step}</span></div>
            <div>localStorage: <span className="font-mono break-all">{localStorage.getItem('customerAuthState') || 'null'}</span></div>
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
