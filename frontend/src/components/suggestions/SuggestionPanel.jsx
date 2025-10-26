import React from 'react';
import useSuggestions from './useSuggestions';
import { Sparkles } from 'lucide-react';

// Helper function to parse numbered lists
const parseNumberedList = (text) => {
    // Check if the text contains numbered patterns like "1. ", "2. ", etc.
    const numberedPattern = /\d+\.\s/g;
    
    if (!numberedPattern.test(text)) {
        // If no numbered pattern, return as single item
        return [{ number: null, content: text }];
    }
    
    // Split by numbered patterns
    const parts = text.split(/(\d+\.\s)/g);
    const items = [];
    let currentNumber = null;
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        
        // Check if this part is a number followed by a period
        if (/^\d+\.$/.test(part)) {
            currentNumber = part.replace('.', '');
        } else if (part && currentNumber) {
            items.push({
                number: currentNumber,
                content: part.trim()
            });
            currentNumber = null;
        } else if (part && !currentNumber) {
            // Text without a number (like intro text)
            items.push({
                number: null,
                content: part
            });
        }
    }
    
    return items.length > 0 ? items : [{ number: null, content: text }];
};

const SuggestionPanel = () => {
    const suggestions = useSuggestions();
    
    // Parse all suggestions into individual items
    const allItems = suggestions.flatMap((s, suggestionIndex) => {
        const parsed = parseNumberedList(s);
        return parsed.map((item, itemIndex) => ({
            ...item,
            id: `${suggestionIndex}-${itemIndex}`,
            showNumber: item.number !== null
        }));
    });
    
    return (
        <div className="h-full">
            <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl shadow-xl p-6 h-full">
                <div className="flex items-center space-x-3 mb-6">
                    <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2">
                        <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">AI Suggestions</h2>
                </div>
                
                {allItems.length > 0 ? (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        {allItems.map((item, i) => (
                            <div 
                                key={item.id}
                                className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20 hover:bg-white/20 transition-all duration-300"
                            >
                                <div className="flex items-start space-x-3">
                                    {item.showNumber && (
                                        <div className="flex-shrink-0 mt-1">
                                            <div className="w-6 h-6 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center text-white font-bold text-sm">
                                                {item.number}
                                            </div>
                                        </div>
                                    )}
                                    {!item.showNumber && (
                                        <div className="flex-shrink-0 mt-1">
                                            <div className="w-2 h-2 rounded-full bg-white/40 backdrop-blur-sm"></div>
                                        </div>
                                    )}
                                    <p className="text-white text-sm leading-relaxed font-medium flex-1">
                                        {item.content}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-white/70 text-center py-8">
                        <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Waiting for AI suggestions...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SuggestionPanel;
