import React from 'react';
import { AuthProvider, ProtectedRoute } from './components/auth';
import CallPage from './components/call/CallPage';
import './index.css';
// import WebRTCDebugger from './components/auth/WebRTCDebugger';
function App() {
    const urlRole = new URLSearchParams(window.location.search).get('role') || 'customer';
    
    return (
        <AuthProvider>                    {/* 🔐 WRAPS APP WITH AUTH */}
            <ProtectedRoute>              {/* 🛡️ PROTECTS YOUR PAGES */}
                <CallPage role={urlRole} />
                {/* <WebRTCDebugger/> */}
            </ProtectedRoute>
        </AuthProvider>
    );
}

export default App;