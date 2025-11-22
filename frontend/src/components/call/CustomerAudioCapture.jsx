/**
 * CustomerAudioCapture component for streaming customer audio to the server.
 * 
 * This component handles:
 * - Starting and stopping audio streaming sessions
 * - Capturing audio from the customer's microphone
 * - Uploading audio chunks to the server for real-time transcription
 * - Managing streaming state and chunk counting
 */

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

const CustomerAudioCapture = ({ isCallActive, sessionId }) => {
  const { token, user, isCustomer } = useAuth();
  const [isStreaming, setIsStreaming] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const recordingIntervalRef = useRef(null);

  const getApiUrl = () => {
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:9795';
    }
    return 'https://ec2-44-196-69-226.compute-1.amazonaws.com';
  };

  useEffect(() => {
    if (isCustomer() && isCallActive && sessionId && token) {
      startAudioStreaming();
    } else {
      stopAudioStreaming();
    }

    return () => stopAudioStreaming();
  }, [isCallActive, sessionId, token, user]);

  const startAudioStreaming = async () => {
    if (!isCustomer()) return;

    try {
      console.log(`Starting customer audio streaming for session: ${sessionId}`);

      const response = await fetch(`${getApiUrl()}/audio-stream/start/${sessionId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error(`Failed to start session: ${response.statusText}`);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;
      chunkIndexRef.current = 0;
      setIsStreaming(true);

      recordingIntervalRef.current = setInterval(() => {
        const recorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });

        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            await uploadChunk(event.data);
          }
        };

        recorder.start();

        setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
        }, 1000);

      }, 1000);

      console.log('Customer audio streaming started');
    } catch (error) {
      console.error('Failed to start audio streaming:', error);
      setIsStreaming(false);
    }
  };

  const uploadChunk = async (audioBlob) => {
    if (!isCustomer() || !token) return;

    try {
      const formData = new FormData();
      formData.append('audio_chunk', audioBlob, `chunk_${chunkIndexRef.current}.webm`);
      formData.append('timestamp', Date.now().toString());

      const response = await fetch(`${getApiUrl()}/audio-stream/upload/${sessionId}?chunk_index=${chunkIndexRef.current}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        chunkIndexRef.current++;
        setChunkCount((prev) => prev + 1);
        console.log(`Uploaded chunk ${chunkIndexRef.current - 1} (${audioBlob.size} bytes)`);
      } else {
        console.error('Failed to upload chunk:', response.statusText);
      }
    } catch (error) {
      console.error('Chunk upload error:', error);
    }
  };

  const stopAudioStreaming = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsStreaming(false);
    setChunkCount(0);
    chunkIndexRef.current = 0;
  };

  if (!isCustomer() || !token || !sessionId) return null;

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
