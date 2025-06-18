import { useState, useEffect, useRef } from 'react';

const ConnectionTest = () => {
  const [role, setRole] = useState(null);
  const [logs, setLogs] = useState([]);
  const [connectionState, setConnectionState] = useState('disconnected');
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-20), { timestamp, message, type }]);
    console.log(`[${timestamp}] ${message}`);
  };

  const setupWebSocket = () => {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket('ws://localhost:8000/ws/signaling');
        
        ws.onopen = () => {
          addLog('✅ WebSocket connected', 'success');
          setConnectionState('websocket-connected');
          resolve(ws);
        };
        
        ws.onerror = (error) => {
          addLog('❌ WebSocket error: ' + error, 'error');
          reject(error);
        };
        
        ws.onclose = () => {
          addLog('🔌 WebSocket closed', 'warning');
          setConnectionState('disconnected');
        };
        
        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            addLog(`📥 Received: ${data.type}`, 'info');
            await handleSignalingMessage(data);
          } catch (error) {
            addLog('❌ Error handling message: ' + error.message, 'error');
          }
        };
        
        wsRef.current = ws;
      } catch (error) {
        addLog('❌ WebSocket setup error: ' + error.message, 'error');
        reject(error);
      }
    });
  };

  const setupPeerConnection = async () => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          addLog('📤 Sending ICE candidate', 'info');
          wsRef.current.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate
          }));
        }
      };

      pc.ontrack = (event) => {
        addLog('📻 Received remote track!', 'success');
        const remoteStream = new MediaStream();
        event.streams[0].getTracks().forEach(track => {
          remoteStream.addTrack(track);
        });
        remoteStreamRef.current = remoteStream;
        
        // Create audio element for remote stream
        let remoteAudio = document.getElementById('remote-audio');
        if (!remoteAudio) {
          remoteAudio = document.createElement('audio');
          remoteAudio.id = 'remote-audio';
          remoteAudio.autoplay = true;
          remoteAudio.controls = true;
          document.body.appendChild(remoteAudio);
        }
        remoteAudio.srcObject = remoteStream;
      };

      pc.onconnectionstatechange = () => {
        addLog(`🔗 Connection state: ${pc.connectionState}`, 
          pc.connectionState === 'connected' ? 'success' : 'info');
        setConnectionState(`peer-${pc.connectionState}`);
      };

      pcRef.current = pc;
      addLog('✅ Peer connection created', 'success');
      
      return pc;
    } catch (error) {
      addLog('❌ Peer connection setup error: ' + error.message, 'error');
      throw error;
    }
  };

  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      addLog('🎤 Got user media', 'success');
      
      // Add tracks to peer connection
      if (pcRef.current) {
        stream.getTracks().forEach(track => {
          pcRef.current.addTrack(track, stream);
        });
        addLog('➕ Added local tracks to peer connection', 'info');
      }
      
      return stream;
    } catch (error) {
      addLog('❌ getUserMedia error: ' + error.message, 'error');
      throw error;
    }
  };

  const handleSignalingMessage = async (data) => {
    const pc = pcRef.current;
    if (!pc) return;

    try {
      switch (data.type) {
        case 'peer-ready':
          addLog(`👥 Peer ready: ${data.isInitiator ? 'initiator' : 'receiver'}`, 'info');
          if (role === 'caller' && !data.isInitiator) {
            // We're the caller and peer is ready, create offer
            setTimeout(async () => {
              await createOffer();
            }, 500);
          }
          break;

        case 'offer':
          addLog('📥 Processing offer', 'info');
          await pc.setRemoteDescription(data.offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'answer',
              answer: pc.localDescription
            }));
            addLog('📤 Sent answer', 'info');
          }
          break;

        case 'answer':
          addLog('📥 Processing answer', 'info');
          await pc.setRemoteDescription(data.answer);
          break;

        case 'ice-candidate':
          addLog('📥 Adding ICE candidate', 'info');
          await pc.addIceCandidate(data.candidate);
          break;
      }
    } catch (error) {
      addLog('❌ Error handling signaling: ' + error.message, 'error');
    }
  };

  const createOffer = async () => {
    const pc = pcRef.current;
    if (!pc) return;

    try {
      addLog('📤 Creating offer', 'info');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'offer',
          offer: pc.localDescription
        }));
        addLog('📤 Sent offer', 'info');
      }
    } catch (error) {
      addLog('❌ Error creating offer: ' + error.message, 'error');
    }
  };

  const startConnection = async (selectedRole) => {
    setRole(selectedRole);
    addLog(`🚀 Starting as ${selectedRole}`, 'info');
    
    try {
      // Setup WebSocket
      await setupWebSocket();
      
      // Setup peer connection
      await setupPeerConnection();
      
      // Get user media
      await getUserMedia();
      
      // Send ready signal
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'peer-ready',
          isInitiator: selectedRole === 'caller'
        }));
        addLog('📤 Sent peer-ready signal', 'info');
      }
      
    } catch (error) {
      addLog('❌ Connection setup failed: ' + error.message, 'error');
    }
  };

  const resetConnection = () => {
    // Clean up
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    // Remove remote audio element
    const remoteAudio = document.getElementById('remote-audio');
    if (remoteAudio) {
      remoteAudio.remove();
    }
    
    setRole(null);
    setLogs([]);
    setConnectionState('disconnected');
  };

  const getStateColor = (state) => {
    if (state.includes('connected')) return 'text-green-600';
    if (state.includes('failed') || state.includes('disconnected')) return 'text-red-600';
    return 'text-yellow-600';
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">WebRTC Connection Test</h1>
      
      {/* Status */}
      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <div className="flex justify-between items-center">
          <span>Connection State: </span>
          <span className={`font-medium ${getStateColor(connectionState)}`}>
            {connectionState}
          </span>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 p-4 rounded-lg mb-4">
        <h3 className="font-semibold text-blue-800 mb-2">Testing Steps:</h3>
        <ol className="list-decimal list-inside text-blue-700 text-sm space-y-1">
          <li>Make sure FastAPI server is running on localhost:8000</li>
          <li>Open this in TWO browser tabs</li>
          <li>In tab 1: Click "Start as Caller"</li>
          <li>In tab 2: Click "Start as Receiver"</li>
          <li>Watch the logs below for connection progress</li>
        </ol>
      </div>

      {/* Controls */}
      {!role ? (
        <div className="text-center space-x-4 mb-6">
          <button
            onClick={() => startConnection('caller')}
            className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg"
          >
            Start as Caller
          </button>
          <button
            onClick={() => startConnection('receiver')}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg"
          >
            Start as Receiver
          </button>
        </div>
      ) : (
        <div className="text-center mb-6">
          <div className="mb-2">
            Running as: <span className="font-bold text-blue-600">{role}</span>
          </div>
          <button
            onClick={resetConnection}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          >
            Reset Connection
          </button>
        </div>
      )}

      {/* Logs */}
      <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
        <h3 className="text-white mb-2">Connection Logs:</h3>
        {logs.map((log, index) => (
          <div key={index} className={`mb-1 ${
            log.type === 'error' ? 'text-red-400' : 
            log.type === 'success' ? 'text-green-400' : 
            log.type === 'warning' ? 'text-yellow-400' : 'text-blue-400'
          }`}>
            [{log.timestamp}] {log.message}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-gray-500">No logs yet...</div>
        )}
      </div>
    </div>
  );
};

export default ConnectionTest;