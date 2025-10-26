// src/components/auth/AgentLogin.jsx - No Domain Version
import React, { useState } from "react";
import { Eye, EyeOff, User, Lock, Shield, AlertCircle, Server } from "lucide-react";
import { useAuth } from "./AuthProvider";

const AgentLogin = ({ onSwitchToCustomer }) => {
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { login, loading, setLoading } = useAuth();

  // Get API URL - works with or without domain
// Replace the getApiUrl function with:
const getApiUrl = () => {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:9795';
  }
  // Your FIXED Elastic IP hostname
  return 'https://ec2-44-196-69-226.compute-1.amazonaws.com';
};

  const isLocalhost = window.location.hostname === 'localhost';

  const handleSubmit = async () => {
    if (!credentials.username || !credentials.password) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const apiUrl = getApiUrl();
      console.log('🔐 Agent login attempt to:', apiUrl);

      const response = await fetch(`${apiUrl}/auth/agent/login`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ Agent login successful');
        login(data.user_info, data.access_token);
      } else {
        setError(data.detail || "Login failed");
        console.error('❌ Agent login failed:', data);
      }
    } catch (error) {
      setError("Network error. Please check your connection.");
      console.error("❌ Agent login network error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  const fillDemoCredentials = (username, password) => {
    setCredentials({ username, password });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-100">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Agent Portal
          </h1>
          <p className="text-gray-600">Access your support dashboard</p>
          
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

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}

        {/* Login Fields */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={credentials.username}
                onChange={(e) =>
                  setCredentials({ ...credentials, username: e.target.value })
                }
                onKeyPress={handleKeyPress}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 outline-none text-gray-900 placeholder-gray-500"
                placeholder="Enter your username"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={credentials.password}
                onChange={(e) =>
                  setCredentials({ ...credentials, password: e.target.value })
                }
                onKeyPress={handleKeyPress}
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 outline-none text-gray-900 placeholder-gray-500"
                placeholder="Enter your password"
                disabled={loading}
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
          </div>
        </div>

        {/* Login Button */}
        <button
          onClick={handleSubmit}
          disabled={loading || !credentials.username || !credentials.password}
          className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 rounded-xl font-medium hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-6"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              Signing in...
            </div>
          ) : (
            "Sign In"
          )}
        </button>

        {/* Demo Credentials - Show in development or testing */}
        {(isLocalhost || window.location.host.includes('ec2-')) && (
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 mb-6">
            <p className="text-sm text-blue-800 font-medium mb-3">
              Demo Credentials:
            </p>
            <div className="space-y-2">
              <button
                onClick={() => fillDemoCredentials("agent1", "agent123")}
                className="w-full text-left p-2 bg-white rounded border border-blue-200 hover:bg-blue-50 transition-colors"
                disabled={loading}
              >
                <div className="text-xs text-blue-600">
                  <div className="font-medium">Agent 1</div>
                  <div>Username: agent1 • Password: agent123</div>
                </div>
              </button>
              <button
                onClick={() => fillDemoCredentials("agent2", "agent456")}
                className="w-full text-left p-2 bg-white rounded border border-blue-200 hover:bg-blue-50 transition-colors"
                disabled={loading}
              >
                <div className="text-xs text-blue-600">
                  <div className="font-medium">Agent 2</div>
                  <div>Username: agent2 • Password: agent456</div>
                </div>
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

        {/* Switch to Customer */}
        <div className="text-center">
          <p className="text-gray-600 text-sm">
            Need customer support?{" "}
            <button
              onClick={onSwitchToCustomer}
              className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
              disabled={loading}
            >
              Customer Access
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AgentLogin;
