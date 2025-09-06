// src/components/WebRTCDebugger.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from './auth';

const WebRTCDebugger = () => {
  const { user, token, isAuthenticated } = useAuth();
  const [backendStatus, setBackendStatus] = useState(null);
  const [wsTest, setWsTest] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    try {
      const response = await fetch('http://localhost:9795/status');
      const data = await response.json();
      setBackendStatus(data);
    } catch (error) {
      setBackendStatus({ error: error.message });
    }
  };

  const testWebSocketConnection = async () => {
    if (!token) {
      setWsTest({ error: 'No authentication token available' });
      return;
    }

    setLoading(true);
    setWsTest({ status: 'connecting' });

    try {
      const ws = new WebSocket(`ws://localhost:9795/ws/signaling/${token}`);
      
      const timeout = setTimeout(() => {
        ws.close();
        setWsTest({ error: 'Connection timeout' });
        setLoading(false);
      }, 10000);

      ws.onopen = () => {
        clearTimeout(timeout);
        setWsTest({ status: 'connected', message: 'WebSocket connection successful!' });
        
        // Send test message
        ws.send(JSON.stringify({
          type: 'test',
          timestamp: Date.now()
        }));
        
        setTimeout(() => {
          ws.close();
          setLoading(false);
        }, 2000);
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        setWsTest({ error: 'WebSocket connection failed', details: error });
        setLoading(false);
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
        if (event.code === 4001) {
          setWsTest({ error: 'Authentication failed - invalid token', code: event.code });
        } else if (wsTest?.status !== 'connected') {
          setWsTest({ error: `Connection closed: ${event.reason}`, code: event.code });
        }
        setLoading(false);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('📥 Received test message:', data);
      };

    } catch (error) {
      setWsTest({ error: error.message });
      setLoading(false);
    }
  };

  const testMediaAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('✅ Media access granted');
      stream.getTracks().forEach(track => track.stop());
      alert('✅ Microphone access granted!');
    } catch (error) {
      console.error('❌ Media access denied:', error);
      alert(`❌ Microphone access denied: ${error.message}`);
    }
  };

  const getStatusColor = (status) => {
    if (status === 'connected') return 'text-green-600';
    if (status === 'connecting') return 'text-yellow-600';
    return 'text-red-600';
  };

  const userRole = user?.role || 'unknown';

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">🔧 WebRTC Connection Debugger</h2>
      
      {/* Authentication Status */}
      <div className="mb-6 p-4 border border-gray-200 rounded-lg">
        <h3 className="font-semibold mb-2">🔐 Authentication Status</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Authenticated:</span>
            <span className={`ml-2 ${isAuthenticated ? 'text-green-600' : 'text-red-600'}`}>
              {isAuthenticated ? '✅ Yes' : '❌ No'}
            </span>
          </div>
          <div>
            <span className="font-medium">User Role:</span>
            <span className={`ml-2 ${userRole !== 'unknown' ? 'text-green-600' : 'text-red-600'}`}>
              {userRole}
            </span>
          </div>
          <div>
            <span className="font-medium">Has Token:</span>
            <span className={`ml-2 ${token ? 'text-green-600' : 'text-red-600'}`}>
              {token ? '✅ Yes' : '❌ No'}
            </span>
          </div>
          <div>
            <span className="font-medium">User ID:</span>
            <span className="ml-2 text-gray-600">
              {user?.username || user?.customer_id || 'N/A'}
            </span>
          </div>
        </div>
        
        {token && (
          <div className="mt-2">
            <span className="font-medium">Token Preview:</span>
            <span className="ml-2 text-xs text-gray-500 font-mono">
              {token.substring(0, 20)}...{token.substring(token.length - 10)}
            </span>
          </div>
        )}
      </div>

      {/* Backend Status */}
      <div className="mb-6 p-4 border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">🖥️ Backend Status</h3>
          <button
            onClick={checkBackendStatus}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Refresh
          </button>
        </div>
        
        {backendStatus ? (
          backendStatus.error ? (
            <div className="text-red-600">❌ Backend not accessible: {backendStatus.error}</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Server Status:</span>
                <span className="ml-2 text-green-600">✅ {backendStatus.server_status}</span>
              </div>
              <div>
                <span className="font-medium">Active Connections:</span>
                <span className="ml-2">{backendStatus.stats?.active_connections || 0}</span>
              </div>
              <div>
                <span className="font-medium">Total Agents:</span>
                <span className="ml-2">{backendStatus.stats?.total_agents || 0}</span>
              </div>
              <div>
                <span className="font-medium">Total Customers:</span>
                <span className="ml-2">{backendStatus.stats?.total_customers || 0}</span>
              </div>
            </div>
          )
        ) : (
          <div className="text-gray-500">Loading backend status...</div>
        )}
      </div>

      {/* WebSocket Test */}
      <div className="mb-6 p-4 border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">🔌 WebSocket Connection Test</h3>
          <button
            onClick={testWebSocketConnection}
            disabled={!token || loading}
            className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
        
        {wsTest && (
          <div className={`mt-2 p-2 rounded ${wsTest.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {wsTest.error ? (
              <div>
                <div className="font-medium">❌ {wsTest.error}</div>
                {wsTest.code && <div className="text-sm">Error Code: {wsTest.code}</div>}
              </div>
            ) : (
              <div className={getStatusColor(wsTest.status)}>
                {wsTest.status === 'connecting' ? '🔄 Connecting...' : `✅ ${wsTest.message}`}
              </div>
            )}
          </div>
        )}
        
        {!token && (
          <div className="mt-2 text-amber-600">⚠️ Authentication required for WebSocket test</div>
        )}
      </div>

      {/* Media Access Test */}
      <div className="mb-6 p-4 border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">🎤 Media Access Test</h3>
          <button
            onClick={testMediaAccess}
            className="px-3 py-1 bg-purple-500 text-white rounded text-sm hover:bg-purple-600"
          >
            Test Microphone
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Tests if browser can access your microphone for voice communication.
        </div>
      </div>

      {/* Connection Steps */}
      <div className="mb-6 p-4 border border-gray-200 rounded-lg">
        <h3 className="font-semibold mb-2">📋 Connection Checklist</h3>
        <div className="space-y-2 text-sm">
          <div className={`flex items-center ${isAuthenticated ? 'text-green-600' : 'text-red-600'}`}>
            <span className="mr-2">{isAuthenticated ? '✅' : '❌'}</span>
            User is authenticated
          </div>
          <div className={`flex items-center ${backendStatus && !backendStatus.error ? 'text-green-600' : 'text-red-600'}`}>
            <span className="mr-2">{backendStatus && !backendStatus.error ? '✅' : '❌'}</span>
            Backend server is running
          </div>
          <div className={`flex items-center ${wsTest?.status === 'connected' ? 'text-green-600' : 'text-gray-400'}`}>
            <span className="mr-2">{wsTest?.status === 'connected' ? '✅' : '⏳'}</span>
            WebSocket connection works
          </div>
          <div className="flex items-center text-gray-400">
            <span className="mr-2">⏳</span>
            Both agent and customer are connected
          </div>
          <div className="flex items-center text-gray-400">
            <span className="mr-2">⏳</span>
            WebRTC peer connection established
          </div>
        </div>
      </div>

      {/* Debugging Tips */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-2">💡 Debugging Tips</h3>
        <ul className="text-blue-700 text-sm space-y-1">
          <li>• Make sure backend server is running on localhost:9795</li>
          <li>• Check browser console for detailed error messages</li>
          <li>• Ensure microphone permissions are granted</li>
          <li>• Try refreshing the page if authentication seems stuck</li>
          <li>• For customer auth, check terminal for verification codes</li>
          <li>• Open agent and customer in different browser tabs/windows</li>
        </ul>
      </div>
    </div>
  );
};

export default WebRTCDebugger;