// import React, { useState, useEffect, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
// import './Chat.css';

// function Chat(){
//     const [connection, setConnection] = useState(null);
//     const [chat, setChat] = useState([]);
//     const [message, setMessage] = useState('');
//     const [users, setUsers] = useState([]);
//     const latestChat = useRef(null);
//     const navigate = useNavigate();

//     const username = sessionStorage.getItem('username');

//     useEffect(() => {
//         if (!username) {
//             navigate('/');
//             return;
//         }

//     latestChat.current = chat;
// }, [chat, navigate, username]);

// useEffect(() => {
//     const startConnection = async () => {
//         try {
//             const connection = new HubConnectionBuilder()
//                 .withUrl("http://localhost:5006/chatHub")
//                 .configureLogging(LogLevel.Information)
//                 .build();

//             connection.on("ReciveMessage", (user, message) => {
//                 const updatedChat = [...latestChat.current];
//                 updatedChat.push({ user, message, timestamp: new Date().toLocaleTimeString() });
//                 setChat(updatedChat);
//             });

//             connection.on("UserConnected", (connectionId) => {
//                 setUsers(prevUsers => [...prevUsers, { id: connectionId, name: "Anonymous" }])
//             });
            
//             connection.on("UserDisconnected", (connectionId) => {
//                 setUsers(prevUsers => prevUsers.filter(user => user.id !== connectionId));
//             });

//             await connection.start();
//             setConnection(connection);

//             await connection.invoke("SendMessage", "System", `${username} has joined the chat`);
//         } catch (e) {
//             console.log("Connection failed: ", e);
//         }
//     };

//     startConnection();

//     return () => {
//         if(connection) {
//             connection.stop();
//         }
//     };
// }, [username]);

// const sendMessage = async (e) => {
//     e.preventDefault();

//     if(message.trim() === "") return;

//     if(connection){
//         try {
//             await connection.invoke("SendMessage", username, message);
//             setMessage("");
//         } catch(e) {
//             console.log(e);
//         }
//     } else {
//         alert("No connection to server yet.");
//     }
// };

// return (
//     <div className="chat-container">
//       <div className="chat-sidebar">
//         <h3>Online Users</h3>
//         <ul className="user-list">
//           {users.map((user, index) => (
//             <li key={index}>{user.name}</li>
//           ))}
//         </ul>
//       </div>
//       <div className="chat-main">
//         <div className="chat-messages">
//           {chat.map((msg, index) => (
//             <div 
//               key={index} 
//               className={`message ${msg.user === username ? 'my-message' : ''}`}
//             >
//               <div className="message-header">
//                 <span className="username">{msg.user}</span>
//                 <span className="timestamp">{msg.timestamp}</span>
//               </div>
//               <div className="message-body">{msg.message}</div>
//             </div>
//           ))}
//         </div>
//         <form onSubmit={sendMessage} className="message-form">
//           <input
//             type="text"
//             value={message}
//             onChange={(e) => setMessage(e.target.value)}
//             placeholder="Type a message..."
//             className="message-input"
//           />
//           <button type="submit" className="send-button">Send</button>
//         </form>
//       </div>
//     </div>
//   );
// }

// export default Chat;

// src/components/Chat.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import './Chat.css';

function Chat() {
  const [connection, setConnection] = useState(null);
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Łączenie...');
  const latestChat = useRef(null);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  
  const username = sessionStorage.getItem('username');
  
  // Keep reference to latest chat messages
  useEffect(() => {
    // If no username, redirect to login
    if (!username) {
      navigate('/');
      return;
    }
    
    latestChat.current = chat;
    
    // Auto-scroll to bottom of messages
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chat, navigate, username]);

  useEffect(() => {
    let hubConnection = null;
    
    const startConnection = async () => {
      try {
        setConnectionStatus('Łączenie z serwerem...');
        
        // Build connection
        hubConnection = new HubConnectionBuilder()
          .withUrl("http://localhost:5006/chatHub")
          .withAutomaticReconnect([0, 1000, 5000, 10000]) // Retry timing in ms
          .configureLogging(LogLevel.Information)
          .build();
          
        console.log('SignalR - Attempting connection');
        
        // Set up event handlers
        hubConnection.on("ReceiveMessage", (user, message) => {
            console.log(`Message received from ${user}: ${message}`);
            const updatedChat = [...latestChat.current];
            updatedChat.push({ 
              user, 
              message, 
              timestamp: new Date().toLocaleTimeString() 
            });
            setChat(updatedChat);
          });
          
          hubConnection.on("UpdateUserList", (userList) => {
            console.log("Updated user list received:", userList);
            setUsers(Array.isArray(userList) ? userList : []);
          });

        // Connection state change handlers
        hubConnection.onreconnecting(error => {
          console.log('SignalR reconnecting', error);
          setConnectionStatus('Próba ponownego połączenia...');
        });
        
        hubConnection.onreconnected(connectionId => {
          console.log('SignalR reconnected', connectionId);
          setConnectionStatus('Połączono');
          // Re-register username after reconnection
          hubConnection.invoke("RegisterUsername", username).catch(err => console.error("Error registering username after reconnect:", err));
        });
        
        hubConnection.onclose(error => {
          console.log('SignalR connection closed', error);
          setConnectionStatus('Rozłączono');
        });

        // Start the connection
        await hubConnection.start();
        console.log('SignalR Connected successfully');
        setConnectionStatus('Połączono');
        setConnection(hubConnection);
        
        // Register username after successful connection
        await hubConnection.invoke("RegisterUsername", username);
        console.log('Username registered');
        
      } catch (e) {
        console.error("Connection failed: ", e);
        setConnectionStatus(`Błąd połączenia: ${e.message}`);
      }
    };

    startConnection();
    
    // Cleanup on component unmount
    return () => {
      if (hubConnection) {
        console.log('Stopping SignalR connection');
        hubConnection.stop()
          .catch(err => console.error('Error stopping connection:', err));
      }
    };
  }, [username]);

  const sendMessage = async (e) => {
    e.preventDefault();
    
    if (message.trim() === "") return;
    
    if (connection && connection.state === 'Connected') {
      try {
        console.log(`Sending message: ${message}`);
        await connection.invoke("SendMessage", username, message);
        setMessage("");
      } catch (e) {
        console.error("Error sending message:", e);
        alert(`Błąd wysyłania wiadomości: ${e.message}`);
      }
    } else {
      console.warn("Cannot send message, connection not established");
      alert("Nie można wysłać wiadomości: brak połączenia z serwerem");
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-sidebar">
        <div className="connection-status">
          <span className={`status-indicator ${connectionStatus === 'Połączono' ? 'connected' : 'disconnected'}`}></span>
          <span>{connectionStatus}</span>
        </div>
        <h3>Użytkownicy online ({users.length})</h3>
        <ul className="user-list">
          {users.length > 0 ? (
            users.map((user, index) => (
              <li key={index}>{user}</li>
            ))
          ) : (
            <li>Brak innych użytkowników</li>
          )}
        </ul>
      </div>
      <div className="chat-main">
        <div className="chat-messages">
          {chat.length > 0 ? (
            chat.map((msg, index) => (
              <div 
                key={index} 
                className={`message ${msg.user === username ? 'my-message' : ''} ${msg.user === 'System' ? 'system-message' : ''}`}
              >
                <div className="message-header">
                  <span className="username">{msg.user}</span>
                  <span className="timestamp">{msg.timestamp}</span>
                </div>
                <div className="message-body">{msg.message}</div>
              </div>
            ))
          ) : (
            <div className="empty-chat">
              <p>Brak wiadomości. Rozpocznij konwersację!</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={sendMessage} className="message-form">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Wpisz wiadomość..."
            className="message-input"
          />
          <button 
            type="submit" 
            className="send-button"
            disabled={!connection || connection.state !== 'Connected'}
          >
            Wyślij
          </button>
        </form>
      </div>
    </div>
  );
}

export default Chat;