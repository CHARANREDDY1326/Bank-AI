import React from 'react';
import AudioHandler from './AudioHandler';
import SuggestionPanel from '../suggestions/SuggestionPanel';
import ControlBar from './ControlBar';
import ConnectionTest from './ConnectionTest';


const CallPage = ({role}) => {
    return (
        <div className = "h-screen flex flex-col items-center justify-between p-6 bg-gray-900 text-white">
            <h1 className = "text-xl mb-4">🔊 Audio Call in Progress</h1>
            <div className="flex-1 w-full flex items-start justify-center">
        {role === 'agent'}
      </div>
      <ControlBar />
      <AudioHandler role = {role} />
      {/* <ConnectionTest /> */}
            </div>
    );
};
export default CallPage;
// && <SuggestionPanel />