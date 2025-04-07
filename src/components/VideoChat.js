// src/components/VideoChat.js - kluczowe części do naprawy
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { HubConnectionBuilder, LogLevel, HttpTransportType } from '@microsoft/signalr';
import CryptoJS from 'crypto-js';
import './VideoChat.css';

function VideoChat() {
  // Istniejące stany...
  const [connection, setConnection] = useState(null);
  const [videoUsers, setVideoUsers] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callStatus, setCallStatus] = useState('disconnected'); // disconnected, calling, connected
  const [currentCall, setCurrentCall] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [debugLogs, setDebugLogs] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  
  const navigate = useNavigate();
  const username = sessionStorage.getItem('username');

  // Funkcja do dodawania logów debugowania
  const addDebugLog = (message) => {
    console.log(message);
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };
  function generateCredentials() {
    const username = Math.floor(Date.now() / 1000) + 3600;  // Ważne przez 1 godzinę
    const credential = CryptoJS.HmacSHA1(username.toString(), "petowiec2115").toString();
    return { username: username.toString(), credential };
  }
  // Konfiguracja ICE serwerów (STUN/TURN)
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:numb.viagenie.ca',
        username: 'webrtc@live.com',
        credential: 'muazkh'
      }
    ]
  };
  // const credentials = generateCredentials();
  // const iceServers = {
  //   iceServers: [
  //     // Możesz zachować publiczne serwery STUN jako backup
  //     // { urls: 'stun:stun.l.google.com:19302' },
      
  //     // Twój własny serwer STUN/TURN na IPv4
  //     { urls: 'stun:65.21.225.215:20136' },
  //     { 
  //       urls: 'turn:65.21.225.215:20136',
  //       username: credentials.username,
  //       credential: credentials.credential
  //     },
      
  //     // Twój własny serwer STUN/TURN na IPv6
  //     { urls: 'stun:[2a01:4f9:6a:18a8::136]:20136' },
  //     { 
  //       urls: 'turn:[2a01:4f9:6a:18a8::136]:20136',
  //       username: credentials.username,
  //       credential: credentials.credential
  //     },
      
  //     // Opcjonalnie TURNS (TURN przez TLS)
  //     { 
  //       urls: 'turns:65.21.225.215:30136',
  //       username: credentials.username,
  //       credential: credentials.credential
  //     },
  //     { 
  //       urls: 'turns:[2a01:4f9:6a:18a8::136]:30136',
  //       username: credentials.username,
  //       credential: credentials.credential
  //     }
  //   ]
  // };
  
  // Inicjalizacja połączenia SignalR
  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }
    
    const startConnection = async () => {
      try {
        addDebugLog("Inicjalizacja połączenia SignalR...");
        
        const hubConnection = new HubConnectionBuilder()
          .withUrl("http://localhost:5006/videoChatHub", {
            skipNegotiation: false,
            transport: HttpTransportType.LongPolling // Użyj długiego pollingu dla większej niezawodności
          })
          .withAutomaticReconnect([0, 1000, 5000, 10000])
          .configureLogging(LogLevel.Information)
          .build();
          
        // Obsługa zdarzeń SignalR
        hubConnection.on("UpdateVideoUsersList", (users) => {
          addDebugLog("Otrzymano aktualizację listy użytkowników");
          // Obsługa różnych formatów danych od serwera
          let userArray = [];
          
          if (Array.isArray(users)) {
            userArray = users;
          } else if (typeof users === 'object') {
            userArray = Object.entries(users).map(([connectionId, name]) => ({
              connectionId,
              username: name
            }));
          }
          
          // Usuń duplikaty bazując na connectionId
          const uniqueUsers = userArray.filter((user, index, self) =>
            index === self.findIndex((u) => u.connectionId === user.connectionId)
          );
          
          addDebugLog(`Przetworzono ${uniqueUsers.length} unikalnych użytkowników`);
          setVideoUsers(uniqueUsers);
        });
        
        hubConnection.on("VideoUserJoined", (connectionId, name) => {
          addDebugLog(`Użytkownik dołączył: ${name}`);
        });
        
        hubConnection.on("VideoUserLeft", (connectionId, name) => {
          addDebugLog(`Użytkownik opuścił: ${name}`);
          
          if (currentCall && currentCall.connectionId === connectionId) {
            endCall();
          }
        });
        
        // KLUCZOWA CZĘŚĆ - odbiór oferty połączenia
        hubConnection.on("ReceiveVideoOffer", async (callerConnectionId, callerName, offer) => {
          addDebugLog(`Otrzymano ofertę połączenia od: ${callerName}`);
          
          // Zamiast natychmiastowego window.confirm, ustaw stan incomingCall
          setIncomingCall({
            callerConnectionId,
            callerName,
            offer
          });
        });
        
        // Odbiór odpowiedzi na ofertę
        hubConnection.on("ReceiveVideoAnswer", async (answerConnectionId, answer) => {
          addDebugLog("Otrzymano odpowiedź na ofertę połączenia");
          
          try {
            // Parsujemy odpowiedź i ustawiamy jako zdalne SDP
            const answerObj = typeof answer === 'string' ? JSON.parse(answer) : answer;
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answerObj));
            addDebugLog("Ustawiono zdalny opis sesji z odpowiedzi");
            
            // Aktualizujemy stan połączenia
            setCallStatus('connected');
          } catch (err) {
            addDebugLog(`Błąd podczas przetwarzania odpowiedzi: ${err.message}`);
            setErrorMessage(`Błąd podczas przetwarzania odpowiedzi: ${err.message}`);
          }
        });
        
        // Odbiór kandydatów ICE
        hubConnection.on("ReceiveIceCandidate", async (senderConnectionId, iceCandidate) => {
          addDebugLog("Otrzymano kandydata ICE");
          
          try {
            // Sprawdź, czy mamy aktywne połączenie peer
            if (!peerConnectionRef.current) {
              addDebugLog("Brak aktywnego połączenia peer, ignorowanie kandydata ICE");
              return;
            }
            
            // Parsujemy kandydata i dodajemy do połączenia
            const candidateObj = typeof iceCandidate === 'string' ? JSON.parse(iceCandidate) : iceCandidate;
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidateObj));
            addDebugLog("Dodano kandydata ICE do połączenia");
          } catch (err) {
            addDebugLog(`Błąd podczas dodawania kandydata ICE: ${err.message}`);
          }
        });
        
        // Zakończenie połączenia
        hubConnection.on("VideoCallEnded", (callerConnectionId, callerName) => {
          addDebugLog(`Połączenie zakończone przez: ${callerName}`);
          endCall();
        });
        
        // Zdarzenia stanu połączenia
        hubConnection.onreconnecting(error => {
          addDebugLog(`Połączenie SignalR próbuje się ponownie połączyć: ${error?.message || 'Nieznany błąd'}`);
        });
        
        hubConnection.onreconnected(connectionId => {
          addDebugLog(`Połączenie SignalR ponownie nawiązane z ID: ${connectionId}`);
          // Rejestracja po ponownym połączeniu
          hubConnection.invoke("RegisterVideoUser", username).catch(err => {
            addDebugLog(`Błąd podczas ponownej rejestracji: ${err.message}`);
          });
        });
        
        hubConnection.onclose(error => {
          addDebugLog(`Połączenie SignalR zamknięte: ${error?.message || 'Normalne zamknięcie'}`);
        });
        
        // Uruchamiamy połączenie
        await hubConnection.start();
        addDebugLog("Połączenie SignalR uruchomione");
        setConnection(hubConnection);
        
        // Rejestrujemy się jako użytkownik wideo
        await hubConnection.invoke("RegisterVideoUser", username);
        addDebugLog(`Zarejestrowano użytkownika: ${username}`);
        
      } catch (e) {
        addDebugLog(`Błąd połączenia: ${e.message}`);
        setErrorMessage(`Błąd połączenia wideo: ${e.message}`);
      }
    };
    
    startConnection();
    
    // Czyszczenie przy odmontowaniu komponentu
    return () => {
      stopLocalStream();
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (connection) {
        connection.stop().catch(err => {
          console.error("Error stopping connection:", err);
        });
      }
    };
  }, [username, navigate]);
  
  // Włączenie kamery i mikrofonu
  const startLocalStream = async () => {
    // Jeśli już mamy strumień, zwracamy go
    if (localStream) {
      return localStream;
    }
    
    try {
      addDebugLog("Próba uzyskania dostępu do kamery i mikrofonu...");
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      addDebugLog("Dostęp do kamery i mikrofonu uzyskany");
      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        addDebugLog("Strumień przypisany do elementu video");
      }
      
      return stream;
    } catch (e) {
      addDebugLog(`Błąd dostępu do mediów: ${e.message}`);
      setErrorMessage(`Błąd dostępu do kamery/mikrofonu: ${e.message}`);
      return null;
    }
  };
  
  // Zatrzymanie lokalnego strumienia
  const stopLocalStream = () => {
    if (localStream) {
      addDebugLog("Zatrzymywanie lokalnego strumienia");
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }
  };
  
  // Utworzenie obiektu połączenia WebRTC
  const createPeerConnection = () => {
    // Jeśli już istnieje połączenie, zamykamy je
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    try {
      addDebugLog("Tworzenie nowego połączenia WebRTC");
      const peerConnection = new RTCPeerConnection(iceServers);
      
      // Zamiast oryginalnych handlerów zdarzeń, używamy naszej funkcji monitorującej
      monitorIceCandidates(peerConnection);
      
      peerConnection.oniceconnectionstatechange = () => {
        addDebugLog("Stan połączenia ICE: " + peerConnection.iceConnectionState);
      };
      
      peerConnection.ontrack = (event) => {
        // Sprawdź, czy event.track i inne właściwości istnieją
        addDebugLog("Track event otrzymany");
        if (event.track) {
          addDebugLog("Track kind: " + event.track.kind);
          addDebugLog("Track ready state: " + event.track.readyState);
          addDebugLog("Track enabled: " + (event.track.enabled ? "tak" : "nie"));
          addDebugLog("Track muted: " + (event.track.muted ? "tak" : "nie"));
        } else {
          addDebugLog("Event zawiera null track");
        }
        
        if (event.streams && event.streams.length > 0) {
          addDebugLog("Stream ID: " + event.streams[0].id);
          addDebugLog("Stream active: " + (event.streams[0].active ? "tak" : "nie"));
          
          // Zapisanie strumienia w state (jeśli używasz React hooks)
          setRemoteStream(event.streams[0]);
          
          // Prawdopodobnie ten fragment był problematyczny - użyjemy remoteVideoRef
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            addDebugLog("Zdalny strumień przypisany do elementu video");
          } else {
            addDebugLog("BŁĄD: remoteVideoRef.current jest null");
          }
        } else {
          addDebugLog("Brak strumieni w evencie");
        }
      };
      
      // Dodanie lokalnych strumieni do połączenia
      if (localStream) {
        addDebugLog("Dodawanie lokalnych ścieżek do połączenia peer");
        localStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, localStream);
        });
      } else {
        addDebugLog("OSTRZEŻENIE: Brak lokalnego strumienia do dodania do połączenia");
      }
      
      peerConnectionRef.current = peerConnection;
      return peerConnection;
    } catch (e) {
      addDebugLog(`Błąd tworzenia połączenia peer: ${e.message}`);
      setErrorMessage(`Błąd tworzenia połączenia P2P: ${e.message}`);
    }
  }
  const logIceCandidates = (peerConnection) => {
    const localCandidates = peerConnection.localDescription?.sdp.split('\n').filter(line => line.includes('a=candidate'));
    const remoteCandidates = peerConnection.remoteDescription?.sdp.split('\n').filter(line => line.includes('a=candidate'));
    
    addDebugLog(`Lokalni kandydaci (${localCandidates?.length || 0}):`);
    localCandidates?.forEach(candidate => addDebugLog(`- ${candidate}`));
    
    addDebugLog(`Zdalni kandydaci (${remoteCandidates?.length || 0}):`);
    remoteCandidates?.forEach(candidate => addDebugLog(`- ${candidate}`));
  };
  // Inicjowanie połączenia (dzwonienie)
  const startCall = async (targetConnectionId, targetUsername) => {
    try {
      addDebugLog(`Rozpoczynanie połączenia z: ${targetUsername}`);
      
      // Najpierw włączamy kamerę i mikrofon
      const stream = await startLocalStream();
      if (!stream) {
        addDebugLog("Nie udało się uzyskać lokalnego strumienia, przerywanie");
        return;
      }
      
      // Ustawiamy stan połączenia
      setCallStatus('calling');
      setCurrentCall({
        connectionId: targetConnectionId,
        username: targetUsername
      });
      
      // Tworzymy połączenie WebRTC
      const peerConnection = createPeerConnection();
      if (!peerConnection) {
        addDebugLog("Nie udało się utworzyć połączenia peer, przerywanie");
        setCallStatus('disconnected');
        setCurrentCall(null);
        return;
      }
      
      // Tworzymy ofertę SDP
      addDebugLog("Tworzenie oferty SDP");
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      addDebugLog("Ustawianie lokalnego opisu sesji");
      await peerConnection.setLocalDescription(offer);
      
      // Czekamy, aż lokalne SDP będzie kompletne
      if (peerConnection.localDescription === null) {
        addDebugLog("Czekanie na kompletny opis lokalnej sesji...");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Wysyłamy ofertę przez SignalR
      addDebugLog("Wysyłanie oferty do odbiorcy");
      const offerJson = JSON.stringify(peerConnection.localDescription);
      await connection.invoke("SendVideoOffer", targetConnectionId, offerJson);
      
      addDebugLog(`Połączenie zainicjowane do: ${targetUsername}`);
    } catch (e) {
      addDebugLog(`Błąd rozpoczynania połączenia: ${e.message}`);
      setErrorMessage(`Błąd inicjowania połączenia: ${e.message}`);
      endCall();
    }
  };
  
  // Zakończenie połączenia
  const endCall = () => {
    addDebugLog("Kończenie połączenia");
    
    // Powiadom drugą stronę o zakończeniu połączenia
    if (connection && currentCall && callStatus !== 'disconnected') {
      connection.invoke("EndVideoCall", currentCall.connectionId)
        .catch(err => {
          addDebugLog(`Błąd podczas kończenia połączenia: ${err.message}`);
        });
    }
    
    // Zamknij połączenie WebRTC
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      addDebugLog("Zamknięto obiekt połączenia WebRTC");
    }
    
    // Zatrzymaj zdalny strumień
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setRemoteStream(null);
    
    // Zresetuj stan połączenia
    setCallStatus('disconnected');
    setCurrentCall(null);
    addDebugLog("Stan połączenia zresetowany");
  };
  
  // Przełączanie kamery
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        const newState = !track.enabled;
        track.enabled = newState;
        addDebugLog(`Kamera ${newState ? 'włączona' : 'wyłączona'}`);
      });
    }
  };
  
  // Przełączanie mikrofonu
  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        const newState = !track.enabled;
        track.enabled = newState;
        addDebugLog(`Mikrofon ${newState ? 'włączony' : 'wyciszony'}`);
      });
    }
  };
  const monitorIceCandidates = (peerConnection) => {
    // Śledzenie wybranych kandydatów
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        addDebugLog(`Nowy kandydat ICE: ${event.candidate.candidate}`);
        
        // Wyślij kandydata do drugiej strony
        if (connection && currentCall) {
          const iceCandidateJson = JSON.stringify(event.candidate);
          connection.invoke("SendIceCandidate", currentCall.connectionId, iceCandidateJson)
            .catch(err => {
              addDebugLog(`Błąd wysyłania kandydata ICE: ${err.message}`);
            });
        }
      } else {
        addDebugLog('Zakończono zbieranie kandydatów ICE');
      }
    };
  
    // Śledzenie zmian stanu połączenia ICE
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      addDebugLog("ICE connection state changed to:", peerConnection.iceConnectionState);
      addDebugLog(`Stan połączenia ICE: ${state}`);
      
      switch (state) {
        case 'checking':
          addDebugLog('Sprawdzanie kandydatów ICE...');
          break;
        case 'connected':
          addDebugLog('Połączenie ICE ustanowione!');
          break;
        case 'completed':
          addDebugLog('Połączenie ICE zakończone pomyślnie');
          break;
        case 'failed':
          addDebugLog('⚠️ Połączenie ICE nie powiodło się! Próba użycia serwera TURN...');
          // Można rozważyć restart ICE
          break;
        case 'disconnected':
          addDebugLog('Połączenie ICE zostało przerwane');
          break;
        case 'closed':
          addDebugLog('Połączenie ICE zostało zamknięte');
          break;
        default:
          break;
      }
      
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        // Jeśli połączenie nie powiodło się, możemy spróbować je zrestartować
        addDebugLog('Próba ponownego nawiązania połączenia...');
        // Lub zakończyć połączenie
        endCall();
      }
    };
  
    // Śledzenie stanu zbierania kandydatów
    peerConnection.onicegatheringstatechange = () => {
      addDebugLog(`Stan zbierania kandydatów ICE: ${peerConnection.iceGatheringState}`);
    };
  
    // Śledzenie stanu sygnalizacji
    peerConnection.onsignalingstatechange = () => {
      addDebugLog(`Stan sygnalizacji: ${peerConnection.signalingState}`);
    };
  };
  // Dodaj funkcje do akceptacji/odrzucenia połączenia:
  const acceptIncomingCall = async () => {
    if (!incomingCall) return;
    
    // Zatrzymaj dźwięk
    if (window.currentRingtone) {
      window.currentRingtone.pause();
      window.currentRingtone = null;
    }
    
    try {
      // Włącz kamerę i mikrofon
      await startLocalStream();
      addDebugLog("Lokalny strumień uruchomiony");
      
      // Ta sama logika co wcześniej w odpowiedzi na ofertę
      setCallStatus('connected');
      setCurrentCall({
        connectionId: incomingCall.callerConnectionId,
        username: incomingCall.callerName
      });
      
      const peerConnection = createPeerConnection();
      addDebugLog("Utworzono obiekt połączenia WebRTC");
      
      const offerObj = typeof incomingCall.offer === 'string' 
        ? JSON.parse(incomingCall.offer) 
        : incomingCall.offer;
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offerObj));
      addDebugLog("Ustawiono zdalny opis sesji");
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      addDebugLog("Utworzono i ustawiono lokalny opis sesji (odpowiedź)");
      
      const answerJson = JSON.stringify(peerConnection.localDescription);
      await connection.invoke("SendVideoAnswer", incomingCall.callerConnectionId, answerJson);
      addDebugLog("Wysłano odpowiedź do dzwoniącego");
      
      // Wyczyść stan przychodzącego połączenia
      setIncomingCall(null);
    } catch (err) {
      addDebugLog(`Błąd podczas odpowiadania na połączenie: ${err.message}`);
      setErrorMessage(`Błąd podczas odpowiadania na połączenie: ${err.message}`);
      setIncomingCall(null);
      endCall();
    }
  };

  const rejectIncomingCall = () => {
    // Zatrzymaj dźwięk
    if (window.currentRingtone) {
      window.currentRingtone.pause();
      window.currentRingtone = null;
    }
    
    addDebugLog(`Odrzucono połączenie od: ${incomingCall?.callerName}`);
    // Możesz dodać kod powiadamiający drugą stronę o odrzuceniu
    // np. connection.invoke("RejectCall", incomingCall.callerConnectionId);
    
    setIncomingCall(null);
  };
  return (
    <div className="video-chat-container">
      <div className="video-sidebar">
        <h2>Czat Wideo</h2>
        
        {errorMessage && (
          <div className="error-message">
            {errorMessage}
          </div>
        )}
        
        <div className="video-controls">
          {callStatus === 'disconnected' ? (
            <button onClick={startLocalStream} className="start-camera-button">
              Włącz kamerę
            </button>
          ) : (
            <>
              <button onClick={toggleVideo} className="toggle-button">
                {localStream && localStream.getVideoTracks()[0]?.enabled 
                  ? "Wyłącz kamerę" 
                  : "Włącz kamerę"}
              </button>
              
              <button onClick={toggleAudio} className="toggle-button">
                {localStream && localStream.getAudioTracks()[0]?.enabled 
                  ? "Wycisz" 
                  : "Włącz mikrofon"}
              </button>
              
              {callStatus !== 'disconnected' && (
                <button onClick={endCall} className="end-call-button">
                  Zakończ połączenie
                </button>
              )}
            </>
            
          )}
        </div>
        
        <div className="video-users-list">
          <h3>Dostępni użytkownicy ({videoUsers.filter(user => user.username !== username).length})</h3>
          <ul>
            {videoUsers
              .filter(user => user.username !== username) // nie pokazuj aktualnego użytkownika
              .map((user) => (
                <li key={user.connectionId} className="video-user-item">
                  {user.username}
                  {callStatus === 'disconnected' && localStream && (
                    <button 
                      onClick={() => startCall(user.connectionId, user.username)}
                      className="call-button"
                    >
                      Zadzwoń
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>

        <div className="debug-logs">
          <h3>Logi debugowania</h3>
          <button onClick={() => setDebugLogs([])} className="clear-logs-button">
            Wyczyść logi
          </button>
          <button 
            onClick={() => peerConnectionRef.current && logIceCandidates(peerConnectionRef.current)} 
            className="debug-button">
            Pokaż kandydatów ICE
          </button>
          <div className="logs-container">
            {debugLogs.map((log, index) => (
              <div key={index} className="log-entry">{log}</div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="video-main">
        <div className="video-streams">
          <div className="video-container local-video">
            <video 
              ref={localVideoRef} 
              autoPlay 
              muted 
              playsInline 
              className={`${remoteStream ? 'small-video' : 'full-video'}`}
            />
            <div className="video-label">Ty</div>
          </div>
          
          {remoteStream && (
            <div className="video-container remote-video">
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                className="full-video"
              />
              <div className="video-label">
                {currentCall ? currentCall.username : 'Rozmówca'}
              </div>
            </div>
          )}
          
          {callStatus === 'calling' && (
            <div className="calling-overlay">
              <div className="calling-animation"></div>
              <p>Dzwonię do {currentCall?.username}...</p>
              <button onClick={endCall} className="cancel-call-button">
                Anuluj połączenie
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Dodaj to w komponencie return, zaraz przed zamknięciem div className="video-chat-container" */}
        {incomingCall && (
          <div className="incoming-call-overlay">
            <div className="incoming-call-card">
              <div className="incoming-call-animation"></div>
              <h3>Połączenie przychodzące</h3>
              <p>{incomingCall.callerName} dzwoni do Ciebie</p>
              <div className="incoming-call-buttons">
                <button 
                  onClick={acceptIncomingCall} 
                  className="accept-call-button"
                >
                  Odbierz
                </button>
                <button 
                  onClick={rejectIncomingCall} 
                  className="reject-call-button"
                >
                  Odrzuć
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default VideoChat;