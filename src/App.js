// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import Chat from './components/Chat';
import VideoChat from './components/VideoChat';
import Login from './components/Login';
import './App.css';

// Komponent nawigacji, który będzie obserwował zmiany w logowaniu
function Navigation() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const navigate = useNavigate();

  // Obserwuj zmiany w sessionStorage
  useEffect(() => {
    const checkLoginStatus = () => {
      const storedUsername = sessionStorage.getItem('username');
      setIsLoggedIn(!!storedUsername);
      setUsername(storedUsername || '');
    };

    // Sprawdź status od razu
    checkLoginStatus();

    // Nasłuchuj na zmiany w sessionStorage
    const handleStorageChange = () => {
      checkLoginStatus();
    };

    window.addEventListener('storage', handleStorageChange);

    // Utworzenie custom eventu do ręcznego wyzwolenia sprawdzenia
    const checkLoginInterval = setInterval(checkLoginStatus, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(checkLoginInterval);
    };
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('username');
    setIsLoggedIn(false);
    setUsername('');
    navigate('/');
  };

  return (
    <header className="App-header">
      <h1>SignalR Chat App</h1>
      {isLoggedIn ? (
        <div className="header-content">
          <nav className="main-nav">
            <Link to="/chat" className="nav-link">Czat tekstowy</Link>
            <Link to="/video" className="nav-link">Czat wideo</Link>
          </nav>
          <div className="user-info">
            <span>Zalogowany jako: {username}</span>
            <button onClick={handleLogout} className="logout-button">Wyloguj</button>
          </div>
        </div>
      ) : null}
    </header>
  );
}

// Główny komponent App
function App() {
  return (
    <Router>
      <div className="App">
        <Navigation />
        <main>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/video" element={<VideoChat />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;