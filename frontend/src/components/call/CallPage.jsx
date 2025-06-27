// src/components/call/CallPage.jsx - COMPLETE FILE
import { useAuth } from '../auth';
import { Phone, PhoneOff, Mic, MicOff, User, Shield } from 'lucide-react';
import { useState } from 'react';
import AudioHandler from './AudioHandler';

const CallPage = ({ role }) => {
    const { user } = useAuth();
    const [isCallActive, setIsCallActive] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
            {/* IMPROVED: Better styled header */}
            <div className="bg-white shadow-sm border-b p-4">
                <div className="max-w-md mx-auto flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            role === 'agent' ? 'bg-blue-500' : 'bg-green-500'
                        }`}>
                            {role === 'agent' ? (
                                <Shield className="w-5 h-5 text-white" />
                            ) : (
                                <User className="w-5 h-5 text-white" />
                            )}
                        </div>
                        <div>
                            <p className="font-medium text-gray-800">
                                {role === 'agent' ? user?.username : user?.name}
                            </p>
                            <p className="text-sm text-gray-600 capitalize">{role}</p>
                        </div>
                    </div>
                    
                    {/* NEW: Simple call controls */}
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
            
            {/* Your existing AudioHandler */}
            <div className="p-4">
                <AudioHandler role={role} />
            </div>
        </div>
    );
};

export default CallPage; // 👈 MAKE SURE THIS LINE EXISTS!