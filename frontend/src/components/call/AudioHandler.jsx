// src/components/AudioHandler.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import useAuthenticatedWebRTC from '../../hooks/useAuthenticatedWebRTC';
import CustomerAudioCapture from './CustomerAudioCapture';

const AudioHandler = ({ role }) => {
 // Determine if this instance should initiate the connection (from old code)
 const isInitiator = role === 'agent';
 
 const { 
   setupMedia, 
   remoteStreamRef, 
   cleanup,
   connectionState,
   error: webrtcError,
   userRole
 } = useAuthenticatedWebRTC(isInitiator);
 
 // State from old code
 const recorderRef = useRef(null);
 const chunksRef = useRef([]);
 const [downloadReady, setDownloadReady] = useState(false);
 const [status, setStatus] = useState('Initializing...');
 const [isRecording, setIsRecording] = useState(false);
 const [connectionStatus, setConnectionStatus] = useState('disconnected');
 const checkIntervalRef = useRef(null);
 const recordingTimeoutRef = useRef(null);
 const mountedRef = useRef(true);
 const recordingStateRef = useRef(false); // Prevent state race conditions (from old code)

 // Session ID for audio streaming
 const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

 // Stable callbacks to prevent re-renders (from old code)
 const updateStatus = useCallback((newStatus) => {
   if (mountedRef.current) {
     setStatus(newStatus);
   }
 }, []);

 const updateConnectionStatus = useCallback((newStatus) => {
   if (mountedRef.current) {
     setConnectionStatus(newStatus);
   }
 }, []);

 const updateIsRecording = useCallback((recording) => {
   if (mountedRef.current && recordingStateRef.current !== recording) {
     recordingStateRef.current = recording;
     setIsRecording(recording);
   }
 }, []);

 // Initialization effect from old code
 useEffect(() => {
   console.log('🎯 AudioHandler starting for role:', role, 'isInitiator:', isInitiator, 'sessionId:', sessionId);
   mountedRef.current = true;
   
   const initializeConnection = async () => {
     try {
       updateStatus('Setting up media and connection...');
       await setupMedia();
       updateStatus('Waiting for remote peer...');
       
       // Start monitoring for remote stream (from old code)
       startRemoteStreamMonitoring();
     } catch (error) {
       console.error('❌ Failed to setup media:', error);
       updateStatus(`Failed to setup: ${error.message}`);
     }
   };

   initializeConnection();

   // Cleanup on unmount (from old code)
   return () => {
     mountedRef.current = false;
     if (checkIntervalRef.current) {
       clearInterval(checkIntervalRef.current);
     }
     if (recordingTimeoutRef.current) {
       clearTimeout(recordingTimeoutRef.current);
     }
     stopRecording();
     cleanup();
   };
 }, [role, setupMedia, cleanup, updateStatus, sessionId]);

 // Monitor connection state changes 
 useEffect(() => {
   switch (connectionState) {
     case 'connecting':
       updateStatus('🔌 Connecting to signaling server...');
       updateConnectionStatus('connecting');
       break;
     case 'connected':
       updateStatus('✅ Connected to signaling server');
       updateConnectionStatus('connecting');
       break;
     case 'peer-connected':
       updateStatus('🎉 Connected to peer - Audio ready!');
       updateConnectionStatus('connected');
       // Auto-start recording for agents (from old code logic)
       if (role === 'agent') {
         setTimeout(() => startRecording(), 1000);
       }
       break;
     case 'failed':
       updateStatus(`❌ Connection failed: ${webrtcError || 'Unknown error'}`);
       updateConnectionStatus('failed');
       break;
     case 'disconnected':
       updateStatus('🔌 Disconnected');
       updateConnectionStatus('disconnected');
       break;
     default:
       if (webrtcError) {
         updateStatus(`❌ Error: ${webrtcError}`);
         updateConnectionStatus('failed');
       }
   }
 }, [connectionState, webrtcError, role, updateStatus, updateConnectionStatus]);

 // Remote stream monitoring from old code - EXACT same logic
 const startRemoteStreamMonitoring = useCallback(() => {
   let attempts = 0;
   const maxAttempts = 60; // Increased to 60 seconds (from old code)
   
   // Clear any existing interval (from old code)
   if (checkIntervalRef.current) {
     clearInterval(checkIntervalRef.current);
   }
   
   checkIntervalRef.current = setInterval(() => {
     if (!mountedRef.current) {
       clearInterval(checkIntervalRef.current);
       return;
     }

     attempts++;
     const remoteStream = remoteStreamRef.current;
     
     if (attempts % 5 === 0) { // Log every 5 attempts to reduce spam (from old code)
       console.log(`🔍 Monitor attempt ${attempts}/${maxAttempts}`);
     }
     
     if (remoteStream && remoteStream.getAudioTracks().length > 0) {
       const audioTracks = remoteStream.getAudioTracks();
       const activeTracks = audioTracks.filter(track => track.readyState === 'live' && track.enabled);
       
       if (attempts % 10 === 0) { // Detailed logging every 10 attempts (from old code)
         console.log('📊 Remote stream check:', {
           totalTracks: audioTracks.length,
           activeTracks: activeTracks.length,
           trackDetails: audioTracks.map(t => ({
             id: t.id,
             kind: t.kind,
             readyState: t.readyState,
             enabled: t.enabled
           }))
         });
       }

       if (activeTracks.length > 0) {
         console.log('✅ Remote audio stream is ready!');
         clearInterval(checkIntervalRef.current);
         updateConnectionStatus('connected');
         updateStatus('Connected - Remote audio ready');
         
         // Auto-start recording for agent role (from old code)
         if (role === 'agent') {
           setTimeout(() => startRecording(remoteStream), 2000);
         } else {
           updateStatus('Connected - Ready to talk');
         }
         return;
       }
     }
     
     if (attempts >= maxAttempts) {
       console.log('⏰ Timeout waiting for remote stream');
       clearInterval(checkIntervalRef.current);
       updateStatus(`Connection timeout after ${maxAttempts} seconds`);
       updateConnectionStatus('failed');
     } else if (attempts % 5 === 0) {
       updateStatus(`Waiting for connection... (${attempts}/${maxAttempts})`);
     }
   }, 1000);
 }, [remoteStreamRef, role, updateStatus, updateConnectionStatus]);

 // Recording logic from old code - EXACT same implementation
 const startRecording = useCallback((streamToRecord = null) => {
   // Prevent multiple simultaneous calls (from old code)
   if (recordingStateRef.current) {
     console.log('⚠️ Already recording');
     return;
   }

   const targetStream = streamToRecord || remoteStreamRef.current;
   if (!targetStream || targetStream.getAudioTracks().length === 0) {
     console.error('❌ No audio stream available for recording');
     updateStatus('No audio stream available');
     return;
   }

   try {
     console.log('🎙️ Starting recording of remote stream');

     // Clear any previous recording data (from old code)
     chunksRef.current = [];
     setDownloadReady(false);

     // Determine best supported MIME type (from old code)
     let mimeType = 'audio/webm;codecs=opus';
     if (!MediaRecorder.isTypeSupported(mimeType)) {
       mimeType = 'audio/webm';
       if (!MediaRecorder.isTypeSupported(mimeType)) {
         mimeType = 'audio/mp4';
         if (!MediaRecorder.isTypeSupported(mimeType)) {
           mimeType = ''; // Let browser choose
         }
       }
     }

     console.log('🎵 Using MIME type:', mimeType || 'browser default');

     const options = mimeType ? { mimeType } : {};
     const recorder = new MediaRecorder(targetStream, options);
     recorderRef.current = recorder;

     recorder.ondataavailable = (event) => {
       if (event.data && event.data.size > 0) {
         chunksRef.current.push(event.data);
         console.log('📦 Recorded chunk:', event.data.size, 'bytes. Total chunks:', chunksRef.current.length);
       }
     };

     recorder.onstop = () => {
       console.log('🛑 Recording stopped. Total chunks:', chunksRef.current.length);
       updateIsRecording(false);
       
       if (chunksRef.current.length > 0) {
         if (mountedRef.current) {
           setDownloadReady(true);
           updateStatus(`Recording complete - ${chunksRef.current.length} chunks captured`);
         }
       } else {
         updateStatus('Recording stopped - No data captured');
       }
     };

     recorder.onerror = (event) => {
       console.error('❌ MediaRecorder error:', event.error);
       updateStatus(`Recording error: ${event.error?.message || 'Unknown error'}`);
       updateIsRecording(false);
     };

     recorder.onstart = () => {
       console.log('✅ Recording started successfully');
       updateIsRecording(true);
       updateStatus('🔴 Recording remote audio...');
     };

     // Start recording with data available every second (from old code)
     recorder.start(1000);

     // Auto-stop recording after 60 seconds (from old code)
     recordingTimeoutRef.current = setTimeout(() => {
       if (recorder.state === 'recording') {
         console.log('⏰ Auto-stopping recording after 60 seconds');
         recorder.stop();
       }
     }, 60000);

   } catch (error) {
     console.error('❌ Error starting recording:', error);
     updateStatus(`Failed to start recording: ${error.message}`);
   }
 }, [remoteStreamRef, updateStatus, updateIsRecording]);

 // Stop recording from old code
 const stopRecording = useCallback(() => {
   if (recordingTimeoutRef.current) {
     clearTimeout(recordingTimeoutRef.current);
   }

   if (recorderRef.current && recorderRef.current.state === 'recording') {
     console.log('🛑 Manually stopping recording');
     recorderRef.current.stop();
   }
 }, []);

 // Download handler from old code - EXACT same implementation
 const handleDownload = useCallback(() => {
   if (chunksRef.current.length === 0) {
     console.log('⚠️ No audio data to download');
     updateStatus('No audio data available');
     return;
   }

   try {
     // Determine file extension based on recorded format (from old code)
     const firstChunk = chunksRef.current[0];
     let extension = 'webm';
     let mimeType = 'audio/webm';
     
     if (firstChunk.type) {
       if (firstChunk.type.includes('mp4')) {
         extension = 'mp4';
         mimeType = 'audio/mp4';
       } else if (firstChunk.type.includes('wav')) {
         extension = 'wav';
         mimeType = 'audio/wav';
       }
     }

     const blob = new Blob(chunksRef.current, { type: mimeType });
     const url = URL.createObjectURL(blob);
     const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
     const filename = `${role}-received-audio-${timestamp}.${extension}`;
     
     const a = document.createElement('a');
     a.href = url;
     a.download = filename;
     a.style.display = 'none';
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
     
     console.log('💾 Download initiated:', filename);
     updateStatus(`Downloaded: ${filename}`);
   } catch (error) {
     console.error('❌ Download error:', error);
     updateStatus(`Download failed: ${error.message}`);
   }
 }, [role, updateStatus]);

 // Manual start handler from old code
 const handleManualStart = useCallback(() => {
   if (connectionStatus === 'connected') {
     startRecording();
   } else {
     updateStatus('Cannot start recording - not connected to remote peer');
   }
 }, [connectionStatus, startRecording, updateStatus]);

 // Status color helper from old code
 const getStatusColor = useCallback(() => {
   if (status.includes('error') || status.includes('Failed') || status.includes('timeout')) {
     return 'text-red-600';
   }
   if (status.includes('Recording') || status.includes('🔴')) {
     return 'text-green-600';
   }
   if (status.includes('complete') || status.includes('Downloaded')) {
     return 'text-blue-600';
   }
   if (status.includes('Connected')) {
     return 'text-emerald-600';
   }
   return 'text-gray-800';
 }, [status]);

 // Check if call is active for customer audio streaming
 const isCallActive = connectionStatus === 'connected';

 return (
   <div className="p-6 border-2 rounded-lg shadow-sm">
     <div className="flex items-center justify-between mb-4">
       <h3 className="text-xl font-semibold">
         Audio Handler ({role === 'agent' ? '🎧 Agent' : '👤 Customer'})
       </h3>
       <div className={`px-3 py-1 rounded-full text-sm font-medium ${
         connectionStatus === 'connected' ? 'bg-green-100 text-green-800' :
         connectionStatus === 'failed' ? 'bg-red-100 text-red-800' :
         'bg-yellow-100 text-yellow-800'
       }`}>
         {connectionStatus === 'connected' ? '🟢 Connected' :
          connectionStatus === 'failed' ? '🔴 Failed' :
          '🟡 Connecting'}
       </div>
     </div>
     
     <div className="mb-6">
       <div className="text-sm text-gray-600 mb-2">Status:</div>
       <div className={`font-medium ${getStatusColor()}`}>
         {status}
       </div>
       
       {isRecording && (
         <div className="flex items-center text-red-600 text-sm mt-2">
           <div className="w-3 h-3 bg-red-600 rounded-full mr-2 animate-pulse"></div>
           Recording in progress...
         </div>
       )}
     </div>

     <div className="flex flex-wrap gap-3">
       {connectionStatus === 'connected' && !isRecording && role === 'agent' && (
         <button
           onClick={handleManualStart}
           className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded text-white text-sm font-medium transition-colors"
         >
           📹 Start Recording
         </button>
       )}
       
       {isRecording && (
         <button
           onClick={stopRecording}
           className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-white text-sm font-medium transition-colors"
         >
           ⏹️ Stop Recording
         </button>
       )}
       
       {downloadReady && (
         <button
           onClick={handleDownload}
           className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded text-white text-sm font-medium transition-colors"
         >
           💾 Download Audio
         </button>
       )}
     </div>

     {role === 'agent' && chunksRef.current.length > 0 && (
       <div className="mt-4 text-sm text-gray-600">
         Recorded {chunksRef.current.length} audio chunks • 
         Size: ~{Math.round(chunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0) / 1024)}KB
       </div>
     )}

     {/* Automatic customer audio streaming - only shows for customers */}
     <CustomerAudioCapture 
       isCallActive={isCallActive} 
       sessionId={sessionId}
     />

     {/* Debug info for troubleshooting */}
     <div className="mt-4 text-xs text-gray-500 bg-gray-50 p-2 rounded">
       Debug: Role={userRole}, State={connectionState}, WS_Error={webrtcError || 'none'}, SessionID={sessionId}
     </div>
   </div>
 );
};

export default AudioHandler;