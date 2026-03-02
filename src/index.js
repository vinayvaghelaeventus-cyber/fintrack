import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Polyfill window.storage using localStorage for local npm run
window.storage = {
  get: async (key) => {
    const value = localStorage.getItem(key);
    if (value === null) throw new Error('Key not found: ' + key);
    return { key, value };
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
    return { key, value };
  },
  delete: async (key) => {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
  list: async (prefix) => {
    const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix));
    return { keys };
  }
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
