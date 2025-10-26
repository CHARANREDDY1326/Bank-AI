import React from 'react';
const ControlBar = () => {
    return (
    <div className="mt-4 flex gap-4">
        <button className="bg-red-600 px-4 py-2 rounded">Leave Call</button>
        <button className="bg-gray-700 px-4 py-2 rounded">Mute</button>
    </div>
    )
};
export default ControlBar;
