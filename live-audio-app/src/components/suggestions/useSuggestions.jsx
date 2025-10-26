 import { useEffect, useState } from 'react';
 const useSuggestions = () => {
    const [suggestions, setSuggestions] = useState([]);
    useEffect(() => {
        const ws = new WebSocket('ws://localhost:8000/ws/suggestions');

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            setSuggestions((prev) => [...prev.slice(-4), data.suggestion]); 
        };

        return () => {
            ws.close();
        };
    }, []);

    return suggestions;
 };
 export default useSuggestions;