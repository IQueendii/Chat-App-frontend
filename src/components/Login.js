// src/components/Login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

function Login() {
  const [username, setUsername] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      // Zapisz nazwę użytkownika w sessionStorage
      sessionStorage.setItem('username', username);
      
      // Wyzwól custom event do powiadomienia o zmianie w sessionStorage
      // (Ponieważ standardowy event 'storage' jest wyzwalany tylko dla innych kart)
      window.dispatchEvent(new Event('storage'));
      
      // Przekieruj do czatu
      navigate('/chat');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Wejdź do czatu</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Nazwa użytkownika:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Wpisz swoją nazwę użytkownika"
              required
            />
          </div>
          <button type="submit" className="login-button">Dołącz do czatu</button>
        </form>
      </div>
    </div>
  );
}

export default Login;