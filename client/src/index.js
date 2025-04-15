import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; 
import App from './App';


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode> {/* Helps identify potential problems in your components */}
    <App />
  </React.StrictMode>
);
