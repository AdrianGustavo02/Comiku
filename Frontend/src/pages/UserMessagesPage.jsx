import React, { useState, useEffect } from 'react';
import { getFirstMessagesPage, getMessagesPage, markMessageAsRead, getMaxDescriptionLength } from '../firebase/userMessages';
import '../styles/UserMessagesPage.css';

export default function UserMessagesPage({ onBack, onPageReady }) {
  const [messages, setMessages] = useState([]);
  const [expandedMessageId, setExpandedMessageId] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const maxDescLength = getMaxDescriptionLength();

  useEffect(() => {
    loadInitialMessages();
  }, []);

  useEffect(() => {
    if (!isLoading && typeof onPageReady === 'function') {
      onPageReady();
    }
  }, [isLoading, onPageReady]);

  const loadInitialMessages = async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await getFirstMessagesPage(15);
      setMessages(result.messages);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (err) {
      console.error('Error al cargar mensajes:', err);
      setError(err.message || 'Error al cargar los mensajes');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!hasMore || isLoadingMore || !nextCursor) return;

    setIsLoadingMore(true);

    try {
      const result = await getMessagesPage(15, nextCursor);
      setMessages((prev) => [...prev, ...result.messages]);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (err) {
      console.error('Error al cargar más mensajes:', err);
      setError(err.message || 'Error al cargar más mensajes');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleMessageClick = async (message) => {
    try {
      if (!message.leido) {
        await markMessageAsRead(message.id);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === message.id
              ? {
                  ...msg,
                  leido: true,
                  fechaLectura: new Date(),
                }
              : msg
          )
        );
      }

      if (expandedMessageId === message.id) {
        setExpandedMessageId(null);
      } else {
        setExpandedMessageId(message.id);
      }
    } catch (err) {
      console.error('Error al marcar mensaje como leído:', err);
      setError('Error al procesar el mensaje');
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    };
    return new Date(date).toLocaleDateString('es-ES', options);
  };

  const isDescriptionLong = (description) => {
    return description && description.length > maxDescLength;
  };

  const renderDescription = (message) => {
    const isExpanded = expandedMessageId === message.id;
    const isLong = isDescriptionLong(message.descripcion);

    if (!isLong) {
      return <p className="message-description">{message.descripcion}</p>;
    }

    return (
      <>
        <p className="mensaje-description">
          {isExpanded
            ? message.descripcion
            : `${message.descripcion.substring(0, maxDescLength)}...`}
        </p>
        {isLong && (
          <button
            className="btn-expand"
            onClick={(e) => {
              e.stopPropagation();
              handleMessageClick(message);
            }}
          >
            {isExpanded ? 'Contraer' : 'Expandir'}
          </button>
        )}
      </>
    );
  };

  if (isLoading) {
    return (
      <main className="app-shell">
        <section className="app-card loading-card loading-container">
          <p>Cargando mensajes...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell user-messages-page">
      <section className="app-card user-messages-container">
        <div className="user-messages-header">
          <h1>Mensajes de usuarios</h1>
          <p>
            {messages.length} mensaje{messages.length !== 1 ? 's' : ''} en total
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}

        {messages.length === 0 ? (
          <div className="no-messages">
            <p>No hay mensajes para mostrar</p>
          </div>
        ) : (
          <>
            <div className="mensajes-list">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`mensaje-card ${message.leido ? 'leido' : 'no-leido'}`}
                  onClick={() => handleMessageClick(message)}
                >
                  <div className="mensaje-header">
                    <div className="mensaje-info">
                      <div className="mensaje-tipo-fecha">
                        <span className={`mensaje-tipo tipo-${message.tipo.toLowerCase()}`}>
                          {message.tipo}
                        </span>
                        <span className="mensaje-fecha">
                          {formatDate(message.fecha)}
                        </span>
                      </div>
                      {!message.leido && (
                        <span className="badge-no-leido">
                          ● No leído
                        </span>
                      )}
                      {message.leido && (
                        <span className="badge-leido">
                          ✓ Leído
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={`mensaje-body ${expandedMessageId === message.id ? 'expanded' : ''}`}>
                    {renderDescription(message)}
                  </div>

                  {message.leido && message.fechaLectura && (
                    <div className="mensaje-footer">
                      <small className="fecha-lectura">
                        Leído: {formatDate(message.fechaLectura)}
                      </small>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="load-more-container">
                <button
                  className="btn-load-more"
                  onClick={loadMoreMessages}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? 'Cargando...' : 'Ver más mensajes'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
