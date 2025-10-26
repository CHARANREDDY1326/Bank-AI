 import { useEffect, useState } from 'react';
const useSuggestions = () => {
    const [suggestions, setSuggestions] = useState([]);
    
    useEffect(() => {
        // Use the same host as the current page, but with WebSocket protocol
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = '9795'; // Backend port
        const ws = new WebSocket(`${protocol}//${host}:${port}/ws/suggestions`);

        ws.onopen = () => {
            console.log('🔌 Suggestions WebSocket connected');
        };

        ws.onmessage = (event) => {
            console.log('📨 Received message:', event.data);
            try {
                const data = JSON.parse(event.data);
                if (data.suggestion) {
                    console.log('💡 Received suggestion:', data.suggestion);
                    setSuggestions((prev) => [...prev.slice(-4), data.suggestion]);
                }
            } catch (error) {
                console.error('❌ Error parsing suggestion:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('❌ Suggestions WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('🔌 Suggestions WebSocket disconnected');
        };

        return () => {
            ws.close();
        };
    }, []);

    return suggestions;
};
export default useSuggestions;