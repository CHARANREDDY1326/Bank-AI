import React from 'react';
import CallPage from './components/call/CallPage';

function App(){
    const role = new URLSearchParams(window.location.search).get('role') || 'customer'
    return <CallPage role={role} />
}

export default App;
