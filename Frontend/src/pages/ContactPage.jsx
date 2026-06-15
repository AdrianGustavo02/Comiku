import React, { useEffect, useRef, useState } from 'react';
import { createMessage, MENSAJE_TYPES } from '../firebase/userMessages';
import { sanitizeForbiddenInputChars } from '../constants/forbiddenInputCharacters';
import '../styles/ContactPage.css';

export default function ContactPage({ authUser, onBack, onPageReady }) {
  const [formData, setFormData] = useState({
    tipo: 'Sugerencia',
    descripcion: '',
  });

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const formRef = useRef(null);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setLoading(false);
      if (typeof onPageReady === 'function') {
        onPageReady();
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [onPageReady]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'descripcion' ? sanitizeForbiddenInputChars(value) : value,
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!formData.tipo || !formData.descripcion.trim()) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (formData.descripcion.trim().length < 10) {
      setError('El mensaje debe tener al menos 10 caracteres');
      return;
    }

    if (!authUser || !authUser.uid) {
      setError('Usuario no autenticado');
      return;
    }

    setIsSubmitting(true);

    try {
      await createMessage({
        tipo: formData.tipo,
        descripcion: formData.descripcion,
        usuarioId: authUser.uid,
      });

      setNotice('Mensaje enviado correctamente. Gracias por tu contacto.');
      setFormData({
        tipo: 'Sugerencia',
        descripcion: '',
      });

      if (formRef.current) {
        formRef.current.reset();
      }

      setTimeout(() => {
        setNotice('');
      }, 5000);
    } catch (err) {
      console.error('Error al enviar mensaje:', err);
      setError(err.message || 'Error al enviar el mensaje. Intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="contact-page contact-page-loading">
        <section className="contact-container contact-loading-card">
          <p className="contact-loading-message">Cargando formulario de contacto...</p>
        </section>
      </main>
    );
  }

  return (
    <div className="contact-page">
      <div className="contact-container">
        <div className="contact-header">
          <h1>Contacto</h1>
          <p>Envía tus sugerencias, quejas o comentarios a la administración</p>
        </div>

        <form ref={formRef} className="contact-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="tipo">Tipo de mensaje</label>
            <select
              id="tipo"
              name="tipo"
              value={formData.tipo}
              onChange={handleInputChange}
              disabled={isSubmitting}
            >
              {MENSAJE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="descripcion">Mensaje</label>
            <textarea
              id="descripcion"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleInputChange}
              placeholder="Escribe tu mensaje aquí..."
              rows="6"
              disabled={isSubmitting}
              maxLength="2000"
            />
            <div className="char-count">
              {formData.descripcion.length} / 2000 caracteres
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
          {notice && <div className="success-message">{notice}</div>}

          <div className="form-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enviando...' : 'Enviar Mensaje'}
            </button>
            {onBack && (
              <button
                type="button"
                className="secondary-button"
                onClick={onBack}
                disabled={isSubmitting}
              >
                Atrás
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
