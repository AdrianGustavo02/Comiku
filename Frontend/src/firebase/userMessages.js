import { db, isFirebaseConfigured } from './firebase';
import { sanitizeForbiddenInputChars } from '../constants/forbiddenInputCharacters';
import {
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  limit,
  startAfter,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

export const MENSAJE_TYPES = ['Sugerencia', 'Queja', 'Otros'];
const MAX_DESCRIPTION_LENGTH = 300;

/**
 * Sanitiza texto eliminando caracteres especiales no permitidos
 */
export const sanitizeText = (text) => {
  return sanitizeForbiddenInputChars(text).trim();
};

/**
 * Valida el tipo de mensaje
 */
export const isValidMessageType = (type) => {
  return MENSAJE_TYPES.includes(type);
};

/**
 * Convierte un snapshot de mensaje a objeto
 */
export const mapMessageSnapshot = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    tipo: data.TipoMensaje || 'Otros',
    descripcion: data.Descripcion || '',
    usuarioId: data.UserID || '',
    fecha: data.Fecha ? data.Fecha.toDate() : new Date(),
    leido: data.Leido || false,
    fechaLectura: data.FechaLectura ? data.FechaLectura.toDate() : null,
  };
};

/**
 * Crea un nuevo mensaje de usuario
 */
export const createMessage = async ({
  tipo,
  descripcion,
  usuarioId,
}) => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase no configurado');
  }

  if (!isValidMessageType(tipo)) {
    throw new Error(`Tipo de mensaje inválido: ${tipo}`);
  }

  if (!descripcion || descripcion.trim().length === 0) {
    throw new Error('La descripción del mensaje es requerida');
  }

  if (!usuarioId) {
    throw new Error('ID de usuario requerido');
  }

  const sanitizedDescripcion = sanitizeText(descripcion);

  if (sanitizedDescripcion.length === 0) {
    throw new Error('El mensaje no puede estar vacío después de sanitización');
  }

  try {
    const docRef = await addDoc(collection(db, 'mensajesUsuarios'), {
      TipoMensaje: tipo,
      Descripcion: sanitizedDescripcion,
      UserID: usuarioId,
      Fecha: serverTimestamp(),
      Leido: false,
      FechaLectura: null,
    });

    return {
      id: docRef.id,
      tipo,
      descripcion: sanitizedDescripcion,
      usuarioId,
      fecha: new Date(),
      leido: false,
      fechaLectura: null,
    };
  } catch (error) {
    console.error('Error al crear mensaje:', error);
    throw new Error('No se pudo enviar el mensaje. Intenta de nuevo.');
  }
};

/**
 * Obtiene una página de mensajes para el administrador
 */
export const getMessagesPage = async (pageSize = 15, lastDocId = null) => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase no configurado');
  }

  try {
    let messageQuery = query(
      collection(db, 'mensajesUsuarios'),
      orderBy('Fecha', 'desc'),
      limit(pageSize + 1)
    );

    if (lastDocId) {
      messageQuery = query(
        collection(db, 'mensajesUsuarios'),
        orderBy('Fecha', 'desc'),
        startAfter(lastDocId),
        limit(pageSize + 1)
      );
    }

    const snapshot = await getDocs(messageQuery);
    const messages = snapshot.docs.map((d) => mapMessageSnapshot(d));

    const hasMore = messages.length > pageSize;
    if (hasMore) {
      messages.pop();
    }

    const nextCursor = messages.length > 0 ? messages[messages.length - 1].id : null;

    return {
      messages,
      hasMore,
      nextCursor,
    };
  } catch (error) {
    console.error('Error al obtener mensajes:', error);
    throw new Error('No se pudieron cargar los mensajes.');
  }
};

/**
 * Obtiene los primeros mensajes sin filtro, ordenados por fecha descending
 */
export const getFirstMessagesPage = async (pageSize = 15) => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase no configurado');
  }

  try {
    const messageQuery = query(
      collection(db, 'mensajesUsuarios'),
      orderBy('Fecha', 'desc'),
      limit(pageSize + 1)
    );

    const snapshot = await getDocs(messageQuery);
    const messages = snapshot.docs.map((d) => mapMessageSnapshot(d));

    const hasMore = messages.length > pageSize;
    if (hasMore) {
      messages.pop();
    }

    const nextCursor = messages.length > 0 ? messages[messages.length - 1].id : null;

    return {
      messages,
      hasMore,
      nextCursor,
    };
  } catch (error) {
    console.error('Error al obtener mensajes iniciales:', error);
    throw new Error('No se pudieron cargar los mensajes.');
  }
};

/**
 * Marca un mensaje como leído
 */
export const markMessageAsRead = async (messageId) => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase no configurado');
  }

  if (!messageId) {
    throw new Error('ID de mensaje requerido');
  }

  try {
    const messageRef = doc(db, 'mensajesUsuarios', messageId);
    await updateDoc(messageRef, {
      Leido: true,
      FechaLectura: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error('Error al marcar mensaje como leído:', error);
    throw new Error('No se pudo marcar el mensaje como leído.');
  }
};

/**
 * Obtiene la longitud máxima de descripción antes de colapsarse
 */
export const getMaxDescriptionLength = () => MAX_DESCRIPTION_LENGTH;

export default {
  createMessage,
  getFirstMessagesPage,
  getMessagesPage,
  markMessageAsRead,
  sanitizeText,
  isValidMessageType,
  mapMessageSnapshot,
  getMaxDescriptionLength,
  MENSAJE_TYPES,
};
