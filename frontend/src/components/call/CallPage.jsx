// src/components/call/CallPage.jsx - COMPLETE FILE
import { useAuth } from '../auth';
import { Phone, PhoneOff, Mic, MicOff, User, Shield } from 'lucide-react';
import { useState } from 'react';
import AudioHandler from './AudioHandler';
import SuggestionPanel from '../suggestions/SuggestionPanel';

const CallPage = ({ role }) => {
    const { user } = useAuth();
    const [isCallActive, setIsCallActive] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    
    // Use actual user role from auth context instead of prop
    const userRole = user?.role || role;
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
            {/* Header with full width */}
            <div className="bg-white shadow-sm border-b p-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            userRole === 'agent' ? 'bg-blue-500' : 'bg-green-500'
                        }`}>
                            {userRole === 'agent' ? (
                                <Shield className="w-5 h-5 text-white" />
                            ) : (
                                <User className="w-5 h-5 text-white" />
                            )}
                        </div>
                        <div>
                            <p className="font-medium text-gray-800">
                                {userRole === 'agent' ? user?.username : user?.name}
                            </p>
                            <p className="text-sm text-gray-600 capitalize">{userRole}</p>
                        </div>
                    </div>
                    
                    {/* Simple call controls */}
                    <div className="flex space-x-2">
                        <button
                            onClick={() => setIsMuted(!isMuted)}
                            className={`p-2 rounded-lg ${isMuted ? 'bg-red-500 text-white' : 'bg-gray-100'}`}
                        >
                            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => setIsCallActive(!isCallActive)}
                            className={`p-2 rounded-lg ${isCallActive ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}
                        >
                            {isCallActive ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Main content area - Modern grid layout */}
            <div className="max-w-7xl mx-auto p-6">
                {userRole === 'agent' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Audio Handler - Takes 1 column on mobile, 2 columns on large screens */}
                        <div className="lg:col-span-2">
                            <AudioHandler role={userRole} />
                        </div>
                        
                        {/* AI Suggestions Panel - Takes 1 column */}
                        <div className="lg:col-span-1">
                            <SuggestionPanel />
                        </div>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto">
                        <AudioHandler role={userRole} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default CallPage; // 👈 MAKE SURE THIS LINE EXISTS!