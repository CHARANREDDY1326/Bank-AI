// src/hooks/useWebRTC.jsx
import { useRef, useCallback } from 'react';

const SIGNALING_SERVER = 'ws://localhost:9795/ws/signaling';
const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const useWebRTC = (isInitiator = false) => {
  const peerConnection = useRef(null);
  const remoteStreamRef = useRef(null);
  const ws = useRef(null);
  const localStream = useRef(null);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const isConnected = useRef(false);
  const isPolite = useRef(!isInitiator); // Polite peer for collision resolution
  const pendingMessages = useRef([]);
  const peerReadySent = useRef(false);
  const negotiationInProgress = useRef(false);
  const remoteDescriptionSet = useRef(false);
  const bothPeersReady = useRef(false);

  // Safe WebSocket send function
  const sendSignal = useCallback((message) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('📤 Sending signal:', message.type);
      ws.current.send(JSON.stringify(message));
      return true;
    } else {
      console.log('⏳ WebSocket not ready, queuing message:', message.type);
      pendingMessages.current.push(message);
      return false;
    }
  }, []);

  // Process pending messages when WebSocket opens
  const processPendingMessages = useCallback(() => {
    if (pendingMessages.current.length > 0) {
      console.log(`📤 Processing ${pendingMessages.current.length} pending messages`);
      const messages = [...pendingMessages.current];
      pendingMessages.current = [];
      
      messages.forEach(message => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          console.log('📤 Sending queued message:', message.type);
          ws.current.send(JSON.stringify(message));
        }
      });
    }
  }, []);

  const setupMedia = useCallback(async () => {
    // CRITICAL FIX: Prevent multiple simultaneous setup calls
    if (setupMedia._isRunning) {
      console.log('🚫 Setup already in progress, skipping');
      return;
    }

    setupMedia._isRunning = true;

    try {
      console.log('🎙️ Setting up media for role:', isInitiator ? 'Initiator (Agent)' : 'Receiver (Customer)');
      
      // Get user media only if we don't already have it
      if (!localStream.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        localStream.current = stream;
      }

      // Create remote stream only if it doesn't exist
      if (!remoteStreamRef.current) {
        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;
      }

      // Setup local audio playback (muted to avoid feedback)
      let localAudio = document.getElementById('local-audio');
      if (!localAudio) {
        localAudio = document.createElement('audio');
        localAudio.srcObject = localStream.current;
        localAudio.autoplay = true;
        localAudio.muted = true;
        localAudio.id = 'local-audio';
        document.body.appendChild(localAudio);
      }

      // Setup WebSocket connection
      await setupWebSocket();

      // Setup WebRTC peer connection
      setupPeerConnection(localStream.current);

    } catch (error) {
      console.error('❌ Error in setupMedia:', error);
      throw error;
    } finally {
      setupMedia._isRunning = false;
    }
  }, [isInitiator]);

  const setupWebSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      // CRITICAL FIX: Check if WebSocket already exists and is connecting/open
      if (ws.current) {
        if (ws.current.readyState === WebSocket.OPEN) {
          console.log('🔌 WebSocket already connected');
          resolve();
          return;
        } else if (ws.current.readyState === WebSocket.CONNECTING) {
          console.log('🔌 WebSocket already connecting, waiting...');
          // Wait for existing connection attempt
          const checkConnection = setInterval(() => {
            if (ws.current.readyState === WebSocket.OPEN) {
              clearInterval(checkConnection);
              resolve();
            } else if (ws.current.readyState === WebSocket.CLOSED || ws.current.readyState === WebSocket.CLOSING) {
              clearInterval(checkConnection);
              // Connection failed, continue with new attempt
              createNewConnection(resolve, reject);
            }
          }, 100);
          return;
        } else {
          // Close any existing connection
          ws.current.close();
          ws.current = null;
        }
      }

      createNewConnection(resolve, reject);
    });
  }, []);

  const createNewConnection = useCallback((resolve, reject) => {
    console.log('🔌 Creating new WebSocket connection...');
    ws.current = new WebSocket(SIGNALING_SERVER);

    const connectionTimeout = setTimeout(() => {
      if (ws.current && ws.current.readyState === WebSocket.CONNECTING) {
        ws.current.close();
        ws.current = null;
      }
      reject(new Error('WebSocket connection timeout'));
    }, 10000);

    ws.current.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('✅ WebSocket connected');
      
      // Process any pending messages first
      processPendingMessages();
      
      // Send peer-ready only once
      if (!peerReadySent.current) {
        peerReadySent.current = true;
        sendSignal({ 
          type: 'peer-ready', 
          isInitiator,
          role: isInitiator ? 'agent' : 'customer'
        });
      }
      
      resolve();
    };

    ws.current.onerror = (error) => {
      clearTimeout(connectionTimeout);
      console.error('❌ WebSocket error:', error);
      reject(error);
    };

    ws.current.onclose = (event) => {
      console.log('🔌 WebSocket closed:', event.code, event.reason);
      peerReadySent.current = false;
      bothPeersReady.current = false;
    };

    // Use the message handler that will be defined later
    ws.current.onmessage = (event) => {
      handleSignalingMessage(event).catch(console.error);
    };
  }, [isInitiator, processPendingMessages, sendSignal]);

  const setupPeerConnection = useCallback((stream) => {
    if (peerConnection.current) {
      console.log('🔗 Peer connection already exists, skipping setup');
      return;
    }

    console.log('🔗 Setting up peer connection');
    peerConnection.current = new RTCPeerConnection(ICE_SERVERS);

    // Add local stream tracks
    stream.getTracks().forEach((track) => {
      console.log('📤 Adding local track:', track.kind);
      peerConnection.current.addTrack(track, stream);
    });

    // Handle incoming remote tracks
    peerConnection.current.ontrack = (event) => {
      console.log('📻 Received remote track:', event.track.kind, 'readyState:', event.track.readyState);
      
      const [remoteStream] = event.streams;
      if (remoteStream) {
        // Replace the remote stream reference completely
        remoteStreamRef.current = remoteStream;

        // Setup remote audio element
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

    // Handle ICE candidates
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 Sending ICE candidate');
        sendSignal({
          type: 'ice-candidate',
          candidate: event.candidate,
        });
      } else {
        console.log('🧊 ICE gathering complete');
      }
    };

    // Connection state monitoring
    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current.connectionState;
      console.log('🔗 Connection state:', state);
      isConnected.current = state === 'connected';
      
      if (state === 'failed') {
        console.log('🔄 Connection failed, attempting to restart ICE');
        peerConnection.current.restartIce();
      }
    };

    peerConnection.current.oniceconnectionstatechange = () => {
      const state = peerConnection.current.iceConnectionState;
      console.log('🧊 ICE connection state:', state);
    };

    peerConnection.current.onsignalingstatechange = () => {
      const state = peerConnection.current.signalingState;
      console.log('📡 Signaling state:', state);
      
      if (state === 'stable') {
        negotiationInProgress.current = false;
        makingOffer.current = false;
        ignoreOffer.current = false;
      }
    };

    // Negotiation handling - CRITICAL FIX: Only allow initiator to handle negotiation
    peerConnection.current.onnegotiationneeded = async () => {
      // ONLY the initiator (agent) should handle negotiation
      if (!isInitiator) {
        console.log('🚫 Not initiator, ignoring negotiation needed event');
        return;
      }

      // Prevent multiple simultaneous negotiations
      if (negotiationInProgress.current || makingOffer.current) {
        console.log('🚫 Negotiation already in progress, skipping');
        return;
      }

      // Wait for both peers to be ready
      if (!bothPeersReady.current) {
        console.log('🚫 Both peers not ready yet, skipping negotiation');
        return;
      }

      // Check if we're in the right state
      const currentState = peerConnection.current.signalingState;
      if (currentState !== 'stable') {
        console.log('🚫 Not in stable state, skipping negotiation. Current state:', currentState);
        return;
      }

      // Debounce negotiation to prevent rapid fire
      if (Date.now() - (peerConnection.current.lastNegotiation || 0) < 2000) {
        console.log('🚫 Negotiation too soon, debouncing');
        return;
      }

      try {
        console.log('🤝 Starting negotiation as initiator (Agent)');
        negotiationInProgress.current = true;
        makingOffer.current = true;
        peerConnection.current.lastNegotiation = Date.now();
        
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        
        console.log('📤 Sending offer from Agent to Customer');
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
  }, [isInitiator, sendSignal]);

  const handleSignalingMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('📥 Received signal:', data.type, 'current state:', peerConnection.current?.signalingState);

      switch (data.type) {
        case 'peer-ready':
          await handlePeerReady(data);
          break;

        case 'offer':
          await handleOffer(data.offer);
          break;

        case 'answer':
          await handleAnswer(data.answer);
          break;

        case 'ice-candidate':
          await handleIceCandidate(data.candidate);
          break;

        default:
          console.log('❓ Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('❌ Error handling signaling message:', error);
    }
  }, []);

  const handlePeerReady = async (data) => {
    console.log('👋 Peer ready received, remote role:', data.role, 'remote isInitiator:', data.isInitiator);
    
    // Mark that both peers are ready
    bothPeersReady.current = true;
    
    // CRITICAL FIX: Only trigger negotiation if we're the initiator AND we have a stable connection
    if (isInitiator && peerConnection.current && peerConnection.current.signalingState === 'stable') {
      console.log('🚀 Agent triggering negotiation after both peers ready');
      
      // Small delay to ensure everything is set up properly
      setTimeout(() => {
        if (peerConnection.current?.signalingState === 'stable' && 
            !negotiationInProgress.current && 
            bothPeersReady.current) {
          // Trigger negotiation by dispatching the event
          peerConnection.current.dispatchEvent(new Event('negotiationneeded'));
        }
      }, 1500); // Increased delay for stability
    } else {
      console.log('👂 Customer ready - waiting for Agent to initiate');
    }
  };

  const handleOffer = async (offer) => {
    // CRITICAL FIX: Only the customer (non-initiator) should handle offers
    if (isInitiator) {
      console.error('❌ AGENT SHOULD NOT RECEIVE OFFERS! This indicates a signaling error.');
      return;
    }

    if (!peerConnection.current) {
      console.error('❌ No peer connection available');
      return;
    }

    try {
      const currentState = peerConnection.current.signalingState;
      console.log('📥 Customer handling offer from Agent, current state:', currentState);
      
      // CRITICAL FIX: Prevent processing offers in wrong states
      if (currentState === 'have-remote-offer') {
        console.log('🚫 Already have remote offer, ignoring duplicate');
        return;
      }
      
      if (currentState === 'have-local-offer') {
        console.log('🔄 Local offer exists, rolling back for remote offer');
        await peerConnection.current.setLocalDescription({type: 'rollback'});
      }
      
      // Only proceed if we're in stable state or have handled collision
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
      
      console.log('✅ Customer sent answer to Agent successfully');
    } catch (error) {
      console.error('❌ Customer error handling offer:', error);
      // Reset state on error
      ignoreOffer.current = false;
      makingOffer.current = false;
    }
  };

  const handleAnswer = async (answer) => {
    // CRITICAL FIX: Only the agent (initiator) should handle answers
    if (!isInitiator) {
      console.error('❌ CUSTOMER SHOULD NOT RECEIVE ANSWERS! This indicates a signaling error.');
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
      console.log('📥 Agent handling answer from Customer, current state:', currentState);
      
      if (currentState !== 'have-local-offer') {
        console.log('⚠️ Agent not in expected state for answer. Expected: have-local-offer, Got:', currentState);
        return;
      }

      console.log('📥 Agent setting remote description (answer)');
      await peerConnection.current.setRemoteDescription(answer);
      remoteDescriptionSet.current = true;
      
      console.log('✅ Agent processed answer from Customer successfully');
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

  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up WebRTC resources');
    
    // Reset flags
    peerReadySent.current = false;
    negotiationInProgress.current = false;
    makingOffer.current = false;
    ignoreOffer.current = false;
    remoteDescriptionSet.current = false;
    isConnected.current = false;
    bothPeersReady.current = false;
    
    // Stop local stream
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        track.stop();
        console.log('🛑 Stopped local track:', track.kind);
      });
      localStream.current = null;
    }

    // Close peer connection
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    // Close WebSocket
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    // Remove audio elements
    const localAudio = document.getElementById('local-audio');
    const remoteAudio = document.getElementById('remote-audio');
    if (localAudio) localAudio.remove();
    if (remoteAudio) remoteAudio.remove();

    // Clear pending messages
    pendingMessages.current = [];
  }, []);

  return { 
    setupMedia, 
    remoteStreamRef, 
    cleanup,
    isConnected: isConnected.current
  };
};

export default useWebRTC;