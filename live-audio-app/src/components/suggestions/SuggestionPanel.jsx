import React from 'react';
import useSuggestions from './useSuggestions';

const SuggestionPanel = () => {
    const suggestions = useSuggestions();
    return (
        <div className="bg-gray-800 p-4 rounded w-full max-w-md">
        <h2 className="text-lg font-semibold mb-2">AI Suggestions</h2>
        <ul className="space-y-2">
            {suggestions.map((s,i) => (
                <li key= {i} className = "bg-gray-700 p-2 rounded">👉 {s}</li>
            ))}
        </ul>
        </div>
    );
};

export default SuggestionPanel;
