import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

const CustomerAudioCapture = ({ isCallActive, sessionId }) => {
  const { token, user, isCustomer } = useAuth();
  const [isStreaming, setIsStreaming] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunkIndexRef = useRef(0);

  const getApiUrl = () => {
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:9795';
    }
    return 'https://ec2-44-196-69-226.compute-1.amazonaws.com';
  };

  useEffect(() => {
    // Only start streaming if user is customer, call is active, and we have session
    if (isCustomer() && isCallActive && sessionId && token) {
      startAudioStreaming();
    } else {
      stopAudioStreaming();
    }

    return () => stopAudioStreaming();
  }, [isCallActive, sessionId, token, user]);

  // Add this debug log in CustomerAudioCapture
useEffect(() => {
  console.log('🔍 CustomerAudioCapture Debug:', {
    isCustomer: isCustomer(),
    hasToken: !!token,
    tokenLength: token?.length,
    user: user,
    sessionId: sessionId,
    isCallActive: isCallActive
  });
}, [token, user, isCallActive, sessionId]);

  const startAudioStreaming = async () => {
    if (!isCustomer()) {
      console.log('🚫 Not a customer, skipping audio streaming');
      return;
    }

    try {
      console.log(`🎙️ Starting customer audio streaming for session: ${sessionId}`);

      // Initialize session
      const response = await fetch(`${getApiUrl()}/audio-stream/start/${sessionId}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to start session: ${response.statusText}`);
      }

      // Get user media (separate from WebRTC stream)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        } 
      });
      
      streamRef.current = stream;

      // Setup MediaRecorder for continuous streaming
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = recorder;
      chunkIndexRef.current = 0;

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          await uploadChunk(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event.error);
        setIsStreaming(false);
      };

      // Start recording with 1-second chunks for real-time streaming
      recorder.start(1000);
      setIsStreaming(true);
      
      console.log('✅ Customer audio streaming started');
    } catch (error) {
      console.error('❌ Failed to start audio streaming:', error);
      setIsStreaming(false);
    }
  };

// Update the uploadChunk function to properly handle form data
const uploadChunk = async (audioBlob) => {
  if (!isCustomer() || !token) return;

  try {
    const formData = new FormData();
    formData.append('audio_chunk', audioBlob, `chunk_${chunkIndexRef.current}.webm`);
    // Remove this line - FastAPI will get chunk_index from query params instead
    // formData.append('chunk_index', chunkIndexRef.current.toString());
    formData.append('timestamp', Date.now().toString());

    const response = await fetch(`${getApiUrl()}/audio-stream/upload/${sessionId}?chunk_index=${chunkIndexRef.current}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (response.ok) {
      chunkIndexRef.current++;
      setChunkCount(prev => prev + 1);
      console.log(`📤 Uploaded chunk ${chunkIndexRef.current - 1} (${audioBlob.size} bytes)`);
    } else {
      console.error('❌ Failed to upload chunk:', response.statusText);
    }
  } catch (error) {
    console.error('❌ Chunk upload error:', error);
  }
};

  const stopAudioStreaming = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      console.log('🛑 Stopped audio streaming');
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsStreaming(false);
    setChunkCount(0);
    chunkIndexRef.current = 0;
  };

  // Only render for customers
  if (!isCustomer() || !token || !sessionId) {
    return null;
  }

  return (
    <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded mt-2">
      {isStreaming ? (
        <div className="flex items-center">
          <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></div>
          Auto-streaming audio... ({chunkCount} chunks sent)
        </div>
      ) : (
        <div className="text-gray-400">Audio streaming inactive</div>
      )}
    </div>
  );
};

export default CustomerAudioCapture;