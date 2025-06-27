import { useRef, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../components/auth'; 

// WebSocket URL configuration - Updated for HTTPS support
const getSignalingServerUrl = (token) => {
  if (window.location.hostname === 'localhost') {
    return `ws://localhost:9795/ws/signaling/${token}`;
  }
  
  // Your FIXED Elastic IP hostname for WebSocket
  return `wss://ec2-44-196-69-226.compute-1.amazonaws.com/ws/signaling/${token}`;
};
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
};

const useAuthenticatedWebRTC = (isInitiator = false) => {
  const { token, user, isAuthenticated } = useAuth();
  
  // State from old working code
  const peerConnection = useRef(null);
  const remoteStreamRef = useRef(null);
  const ws = useRef(null);
  const localStream = useRef(null);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const isConnected = useRef(false);
  const isPolite = useRef(!isInitiator);
  const pendingMessages = useRef([]);
  const peerReadySent = useRef(false);
  const negotiationInProgress = useRef(false);
  const remoteDescriptionSet = useRef(false);
  const bothPeersReady = useRef(false);

  // New state for connection tracking
  const [connectionState, setConnectionState] = useState('disconnected');
  const [error, setError] = useState(null);

  // Determine user role - CRITICAL for backend routing
  const userRole = user?.role || (isInitiator ? 'agent' : 'customer');

  // Enhanced WebSocket send with proper user info for backend
  const sendSignal = useCallback((message) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.log('⏳ WebSocket not ready, queuing message:', message.type);
      pendingMessages.current.push(message);
      return false;
    }

    try {
      // Backend expects specific format with sender info
      const payload = {
        ...message,
        timestamp: Date.now(),
        // Don't add sender info here - backend adds it automatically
      };
      
      console.log(`📤 Sending signal as ${userRole}:`, message.type);
      ws.current.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error('❌ Failed to send signal:', error);
      pendingMessages.current.push(message);
      return false;
    }
  }, [userRole]);

  // Process pending messages from old code
  const processPendingMessages = useCallback(() => {
    if (pendingMessages.current.length > 0 && ws.current?.readyState === WebSocket.OPEN) {
      console.log(`📤 Processing ${pendingMessages.current.length} pending messages`);
      const messages = [...pendingMessages.current];
      pendingMessages.current = [];
      
      messages.forEach((message, index) => {
        // Small delay between messages to prevent overwhelming
        setTimeout(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            sendSignal(message);
          }
        }, index * 100);
      });
    }
  }, [sendSignal]);

  // Enhanced setupMedia - requires authentication
  const setupMedia = useCallback(async () => {
    // CRITICAL: Must be authenticated for this backend
    if (!isAuthenticated || !token || !user) {
      const errorMsg = 'Authentication required for WebRTC connection';
      setError(errorMsg);
      setConnectionState('failed');
      throw new Error(errorMsg);
    }

    // Prevent multiple simultaneous setup calls (from old code)
    if (setupMedia._isRunning) {
      console.log('🚫 Setup already in progress, skipping');
      return;
    }

    setupMedia._isRunning = true;

    try {
      console.log('🎙️ Setting up authenticated media for:', userRole, 'isInitiator:', isInitiator);
      console.log('🔐 User info:', { role: user.role, id: user.username || user.customer_id });
      console.log('🌐 Protocol:', window.location.protocol, 'Host:', window.location.host);
      setConnectionState('setting-up');
      
      // Get user media only if we don't already have it (from old code)
      if (!localStream.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 44100
            } 
          });
          localStream.current = stream;
          console.log('🎤 Got local media stream');
        } catch (mediaError) {
          console.error('❌ Media access denied:', mediaError);
          
          // Better error messages for different scenarios
          if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
            throw new Error('Microphone requires HTTPS. Please use: https://' + window.location.host);
          } else if (mediaError.name === 'NotAllowedError') {
            throw new Error('Microphone access denied. Please allow microphone permission and refresh.');
          } else if (mediaError.name === 'NotFoundError') {
            throw new Error('No microphone found. Please connect a microphone.');
          } else {
            throw new Error('Microphone access required for voice communication');
          }
        }
      }

      // Create remote stream only if it doesn't exist (from old code)
      if (!remoteStreamRef.current) {
        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;
      }

      // Setup local audio playback (from old code)
      let localAudio = document.getElementById('local-audio');
      if (!localAudio) {
        localAudio = document.createElement('audio');
        localAudio.srcObject = localStream.current;
        localAudio.autoplay = true;
        localAudio.muted = true;
        localAudio.id = 'local-audio';
        document.body.appendChild(localAudio);
      }

      // Setup authenticated WebSocket connection
      await setupAuthenticatedWebSocket();

      // Setup WebRTC peer connection using old code
      setupPeerConnection(localStream.current);

      console.log('✅ Authenticated media setup complete');

    } catch (error) {
      console.error('❌ Error in setupMedia:', error);
      setError(error.message);
      setConnectionState('failed');
      throw error;
    } finally {
      setupMedia._isRunning = false;
    }
  }, [isAuthenticated, token, user, userRole, isInitiator]);

  // Authenticated WebSocket setup - works with your backend
  const setupAuthenticatedWebSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!token || !isAuthenticated) {
        const error = new Error('Authentication token required');
        setError(error.message);
        reject(error);
        return;
      }

      if (!user || !user.role) {
        const error = new Error('User role not available');
        setError(error.message);
        reject(error);
        return;
      }

      // Check if WebSocket already exists and is connecting/open (from old code)
      if (ws.current) {
        if (ws.current.readyState === WebSocket.OPEN) {
          console.log('🔌 Authenticated WebSocket already connected');
          resolve();
          return;
        } else if (ws.current.readyState === WebSocket.CONNECTING) {
          console.log('🔌 WebSocket already connecting, waiting...');
          const checkConnection = setInterval(() => {
            if (ws.current.readyState === WebSocket.OPEN) {
              clearInterval(checkConnection);
              resolve();
            } else if (ws.current.readyState === WebSocket.CLOSED || ws.current.readyState === WebSocket.CLOSING) {
              clearInterval(checkConnection);
              createAuthenticatedConnection(resolve, reject);
            }
          }, 100);
          return;
        } else {
          ws.current.close();
          ws.current = null;
        }
      }

      createAuthenticatedConnection(resolve, reject);
    });
  }, [token, isAuthenticated, user]);

  // Create authenticated connection for your backend
  const createAuthenticatedConnection = useCallback((resolve, reject) => {
    if (!token) {
      reject(new Error('No authentication token available'));
      return;
    }

    try {
      const wsUrl = getSignalingServerUrl(token);
      console.log('🔐 Connecting as', userRole, 'to:', wsUrl.replace(token, 'TOKEN_HIDDEN'));
      console.log('🌐 WebSocket protocol:', wsUrl.startsWith('wss:') ? 'WSS (Secure)' : 'WS (Insecure)');
      
      ws.current = new WebSocket(wsUrl);
      setConnectionState('connecting');

      const connectionTimeout = setTimeout(() => {
        if (ws.current && ws.current.readyState === WebSocket.CONNECTING) {
          ws.current.close();
          ws.current = null;
        }
        const errorMsg = 'WebSocket connection timeout - check network and server';
        setError(errorMsg);
        setConnectionState('failed');
        reject(new Error(errorMsg));
      }, 15000); // Longer timeout for auth

      ws.current.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('✅ Authenticated WebSocket connected as', userRole);
        console.log('🔒 Connection secure:', wsUrl.startsWith('wss:'));
        setConnectionState('connected');
        setError(null);
        
        // Process any pending messages first (from old code)
        processPendingMessages();
        
        // Send peer-ready with proper user info for backend (from old code)
        if (!peerReadySent.current) {
          peerReadySent.current = true;
          sendSignal({ 
            type: 'peer-ready', 
            isInitiator,
            role: userRole,
            user: {
              // Backend expects specific user structure
              id: user.role === 'agent' ? user.username : user.customer_id,
              name: user.role === 'agent' ? (user.full_name || user.username) : user.name,
              role: user.role
            }
          });
        }
        
        resolve();
      };

      ws.current.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error('❌ Authenticated WebSocket error:', error);
        
        // Better error messages based on context
        let errorMsg = 'WebSocket connection failed';
        if (window.location.protocol === 'https:' && wsUrl.startsWith('ws:')) {
          errorMsg = 'Mixed content error: HTTPS page cannot connect to insecure WebSocket';
        } else if (window.location.protocol === 'http:' && wsUrl.startsWith('wss:')) {
          errorMsg = 'Protocol mismatch: HTTP page cannot connect to secure WebSocket';
        }
        
        setError(errorMsg);
        setConnectionState('failed');
        reject(new Error(errorMsg));
      };

      ws.current.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('🔌 Authenticated WebSocket closed:', event.code, event.reason);
        
        // Backend specific error codes
        if (event.code === 4001) {
          setError('Authentication failed - please login again');
        } else if (event.code === 1006) {
          setError('Connection lost unexpectedly - check network');
        } else if (event.code === 1002) {
          setError('Protocol error - server rejected connection');
        } else {
          setError(`Connection closed: ${event.reason || 'Network error'}`);
        }
        
        setConnectionState('disconnected');
        peerReadySent.current = false;
        bothPeersReady.current = false;
        
        // Auto-reconnect logic for network issues (not auth failures)
        if (event.code !== 4001 && event.code !== 1002 && isAuthenticated) {
          setTimeout(() => {
            if (isAuthenticated && token) {
              console.log('🔄 Attempting to reconnect...');
              setupAuthenticatedWebSocket().catch(console.error);
            }
          }, 3000);
        }
      };

      ws.current.onmessage = (event) => {
        handleSignalingMessage(event).catch(console.error);
      };

    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      setError(error.message);
      setConnectionState('failed');
      reject(error);
    }
  }, [token, userRole, user, isAuthenticated, processPendingMessages, sendSignal]);

  // Peer connection setup from old code - exactly the same
  const setupPeerConnection = useCallback((stream) => {
    if (peerConnection.current) {
      console.log('🔗 Peer connection already exists, skipping setup');
      return;
    }

    console.log('🔗 Setting up peer connection for', userRole);
    peerConnection.current = new RTCPeerConnection(ICE_SERVERS);

    // Add local stream tracks (from old code)
    stream.getTracks().forEach((track) => {
      console.log('📤 Adding local track:', track.kind, 'from', userRole);
      peerConnection.current.addTrack(track, stream);
    });

    // Handle incoming remote tracks (from old code)
    peerConnection.current.ontrack = (event) => {
      console.log('📻 Received remote track:', event.track.kind, 'readyState:', event.track.readyState);
      
      const [remoteStream] = event.streams;
      if (remoteStream) {
        // Replace the remote stream reference completely (from old code)
        remoteStreamRef.current = remoteStream;

        // Setup remote audio element (from old code)
        let remoteAudio = document.getElementById('remote-audio');
        if (remoteAudio) remoteAudio.remove();
        
        remoteAudio = document.createElement('audio');
        remoteAudio.id = 'remote-audio';
        remoteAudio.autoplay = true;
        remoteAudio.volume = 1.0;
        document.body.appendChild(remoteAudio);
        remoteAudio.srcObject = remoteStream;
        
        console.log('✅ Remote audio setup complete, tracks:', remoteStream.getAudioTracks().length);
      }
    };

    // Handle ICE candidates (from old code)
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 Sending ICE candidate from', userRole);
        sendSignal({
          type: 'ice-candidate',
          candidate: event.candidate,
        });
      } else {
        console.log('🧊 ICE gathering complete for', userRole);
      }
    };

    // Connection state monitoring (from old code)
    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current.connectionState;
      console.log('🔗 Peer connection state:', state, 'for', userRole);
      isConnected.current = state === 'connected';
      setConnectionState(state === 'connected' ? 'peer-connected' : state);
      
      if (state === 'failed') {
        console.log('🔄 Connection failed, attempting to restart ICE');
        peerConnection.current.restartIce();
      }
    };

    peerConnection.current.oniceconnectionstatechange = () => {
      const state = peerConnection.current.iceConnectionState;
      console.log('🧊 ICE connection state:', state, 'for', userRole);
    };

    peerConnection.current.onsignalingstatechange = () => {
      const state = peerConnection.current.signalingState;
      console.log('📡 Signaling state:', state, 'for', userRole);
      
      if (state === 'stable') {
        negotiationInProgress.current = false;
        makingOffer.current = false;
        ignoreOffer.current = false;
      }
    };

    // Negotiation handling - CRITICAL: Backend expects only agents to send offers
    peerConnection.current.onnegotiationneeded = async () => {
      // ONLY agents should handle negotiation - matches backend logic
      if (userRole !== 'agent') {
        console.log('🚫 Not agent, ignoring negotiation needed event');
        return;
      }

      // Prevent multiple simultaneous negotiations (from old code)
      if (negotiationInProgress.current || makingOffer.current) {
        console.log('🚫 Negotiation already in progress, skipping');
        return;
      }

      // Wait for both peers to be ready (from old code)
      if (!bothPeersReady.current) {
        console.log('🚫 Both peers not ready yet, skipping negotiation');
        return;
      }

      // Check if we're in the right state (from old code)
      const currentState = peerConnection.current.signalingState;
      if (currentState !== 'stable') {
        console.log('🚫 Not in stable state, skipping negotiation. Current state:', currentState);
        return;
      }

      // Debounce negotiation to prevent rapid fire (from old code)
      if (Date.now() - (peerConnection.current.lastNegotiation || 0) < 2000) {
        console.log('🚫 Negotiation too soon, debouncing');
        return;
      }

      try {
        console.log('🤝 Agent starting negotiation (backend will route to customers)');
        negotiationInProgress.current = true;
        makingOffer.current = true;
        peerConnection.current.lastNegotiation = Date.now();
        
        const offer = await peerConnection.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        });
        
        await peerConnection.current.setLocalDescription(offer);
        
        console.log('📤 Sending offer from agent (backend will route to customer)');
        sendSignal({
          type: 'offer',
          offer: peerConnection.current.localDescription,
        });
      } catch (err) {
        console.error('❌ Failed to create offer:', err);
        negotiationInProgress.current = false;
        makingOffer.current = false;
      }
    };
  }, [userRole, sendSignal]);

  // Message handling from old code with backend awareness
  const handleSignalingMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.data);
      const senderRole = data.sender?.role || 'unknown';
      console.log('📥 Received signal:', data.type, 'from:', senderRole, 'current state:', peerConnection.current?.signalingState);

      switch (data.type) {
        case 'peer-ready':
          await handlePeerReady(data);
          break;
        case 'offer':
          await handleOffer(data.offer, senderRole);
          break;
        case 'answer':
          await handleAnswer(data.answer, senderRole);
          break;
        case 'ice-candidate':
          await handleIceCandidate(data.candidate);
          break;
        case 'peer-disconnected':
          console.log('👋 Peer disconnected:', data.user);
          break;
        default:
          console.log('❓ Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('❌ Error handling signaling message:', error);
    }
  }, []);

  // All the message handlers from old code with backend validation
  const handlePeerReady = async (data) => {
    const remoteRole = data.role || data.user?.role;
    console.log('👋 Peer ready received from:', remoteRole);
    
    // Mark that both peers are ready (from old code)
    bothPeersReady.current = true;
    
    // Only agents trigger negotiation - matches backend expectations
    if (userRole === 'agent' && peerConnection.current && peerConnection.current.signalingState === 'stable') {
      console.log('🚀 Agent triggering negotiation after peer ready');
      
      // Small delay to ensure everything is set up properly (from old code)
      setTimeout(() => {
        if (peerConnection.current?.signalingState === 'stable' && 
            !negotiationInProgress.current && 
            bothPeersReady.current) {
          // Trigger negotiation by dispatching the event (from old code)
          peerConnection.current.dispatchEvent(new Event('negotiationneeded'));
        }
      }, 1500);
    } else {
      console.log('👂 Customer ready - waiting for agent to initiate');
    }
  };

  const handleOffer = async (offer, senderRole) => {
    // Validate: Only customers should receive offers (backend routes correctly)
    if (userRole !== 'customer') {
      console.error('❌ ONLY CUSTOMERS SHOULD RECEIVE OFFERS! Current role:', userRole, 'Sender:', senderRole);
      return;
    }

    if (!peerConnection.current) {
      console.error('❌ No peer connection available');
      return;
    }

    try {
      const currentState = peerConnection.current.signalingState;
      console.log('📥 Customer handling offer from agent, current state:', currentState);
      
      // Prevent processing offers in wrong states (from old code)
      if (currentState === 'have-remote-offer') {
        console.log('🚫 Already have remote offer, ignoring duplicate');
        return;
      }
      
      if (currentState === 'have-local-offer') {
        console.log('🔄 Local offer exists, rolling back for remote offer');
        await peerConnection.current.setLocalDescription({type: 'rollback'});
      }
      
      // Only proceed if we're in stable state or have handled collision (from old code)
      if (currentState !== 'stable' && currentState !== 'have-local-offer') {
        console.log('🚫 Invalid state for handling offer:', currentState);
        return;
      }

      console.log('📥 Customer setting remote description (offer)');
      await peerConnection.current.setRemoteDescription(offer);
      remoteDescriptionSet.current = true;

      console.log('📤 Customer creating and setting local description (answer)');
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      
      sendSignal({
        type: 'answer',
        answer: peerConnection.current.localDescription,
      });
      
      console.log('✅ Customer sent answer (backend will route to agent)');
    } catch (error) {
      console.error('❌ Customer error handling offer:', error);
      ignoreOffer.current = false;
      makingOffer.current = false;
    }
  };

  const handleAnswer = async (answer, senderRole) => {
    // Validate: Only agents should receive answers (backend routes correctly)
    if (userRole !== 'agent') {
      console.error('❌ ONLY AGENTS SHOULD RECEIVE ANSWERS! Current role:', userRole, 'Sender:', senderRole);
      return;
    }

    if (!peerConnection.current) {
      console.error('❌ No peer connection available');
      return;
    }

    try {
      if (ignoreOffer.current) {
        console.log('🚫 Ignoring answer due to ignored offer');
        return;
      }

      const currentState = peerConnection.current.signalingState;
      console.log('📥 Agent handling answer from customer, current state:', currentState);
      
      if (currentState !== 'have-local-offer') {
        console.log('⚠️ Agent not in expected state for answer. Expected: have-local-offer, Got:', currentState);
        return;
      }

      console.log('📥 Agent setting remote description (answer)');
      await peerConnection.current.setRemoteDescription(answer);
      remoteDescriptionSet.current = true;
      
      console.log('✅ Agent processed answer from customer successfully');
      negotiationInProgress.current = false;
      makingOffer.current = false;
    } catch (error) {
      console.error('❌ Agent error handling answer:', error);
    }
  };

  const handleIceCandidate = async (candidate) => {
    if (!peerConnection.current) {
      console.error('❌ No peer connection available for ICE candidate');
      return;
    }

    try {
      if (candidate) {
        console.log('🧊 Adding ICE candidate');
        await peerConnection.current.addIceCandidate(candidate);
      }
    } catch (error) {
      if (!ignoreOffer.current) {
        console.error('❌ Error adding ICE candidate:', error);
      }
    }
  };

  // Cleanup from old code
  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up authenticated WebRTC resources');
    
    // Reset flags (from old code)
    peerReadySent.current = false;
    negotiationInProgress.current = false;
    makingOffer.current = false;
    ignoreOffer.current = false;
    remoteDescriptionSet.current = false;
    isConnected.current = false;
    bothPeersReady.current = false;
    
    // Stop local stream (from old code)
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        track.stop();
        console.log('🛑 Stopped local track:', track.kind);
      });
      localStream.current = null;
    }

    // Close peer connection (from old code)
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    // Close WebSocket (from old code)
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    // Remove audio elements (from old code)
    const localAudio = document.getElementById('local-audio');
    const remoteAudio = document.getElementById('remote-audio');
    if (localAudio) localAudio.remove();
    if (remoteAudio) remoteAudio.remove();

    // Clear pending messages (from old code)
    pendingMessages.current = [];
    
    // Reset state
    setConnectionState('disconnected');
    setError(null);
  }, []);

  // Auto-cleanup on auth changes
  useEffect(() => {
    if (!isAuthenticated || !token) {
      cleanup();
    }
  }, [isAuthenticated, token, cleanup]);

  return { 
    setupMedia, 
    remoteStreamRef, 
    cleanup,
    connectionState,
    error,
    isConnected: isConnected.current,
    userRole
  };
};

export default useAuthenticatedWebRTC;