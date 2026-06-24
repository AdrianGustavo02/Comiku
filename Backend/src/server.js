const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { StreamChat } = require('stream-chat');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BLOCKED_EMAILS_COLLECTION = 'emailsBloqueados';

app.use(cors());
app.use(express.json({ limit: '5mb' }));

function getReferenceFields() {
  const configuredFields = process.env.USER_REFERENCE_FIELDS;

  if (!configuredFields) {
    return ['UserID', 'ActorUserID', 'AdministratorUserID', 'UID', 'uid', 'userId', 'UserId', 'usuarioId', 'UsuarioId'];
  }

  return configuredFields
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

function getSafeStreamImage(profile) {
  const rawImage = profile?.FotoPerfil || profile?.fotoPerfil || null;

  if (typeof rawImage !== 'string') {
    return null;
  }

  if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
    return rawImage;
  }

  return null;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getBlockedEmailDocId(email) {
  return encodeURIComponent(normalizeEmail(email));
}

//Valido si un email esta bloqueado para registrarse nuevamente.
async function isEmailBlockedForRegistration(adminDb, email) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return false;
  }

  const snapshot = await adminDb
    .collection(BLOCKED_EMAILS_COLLECTION)
    .doc(getBlockedEmailDocId(normalizedEmail))
    .get();

  return snapshot.exists;
}

//Bloqueo un email para que no pueda ser usado en futuros registros.
async function blockEmailForFutureRegistration(adminDb, { email, blockedByUid = '', deletedUid = '' }) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return false;
  }

  await adminDb
    .collection(BLOCKED_EMAILS_COLLECTION)
    .doc(getBlockedEmailDocId(normalizedEmail))
    .set(
      {
        email: normalizedEmail,
        blockedAt: new Date(),
        blockedByUid: blockedByUid || null,
        deletedUid: deletedUid || null,
        reason: 'account_deleted',
      },
      { merge: true },
    );

  return true;
}

//Busco el email del usuario para bloquearlo de futuros registros.
async function resolveUserEmailForBlocking(adminAuth, adminDb, uid) {
  if (!uid) {
    return '';
  }

  try {
    const authUser = await adminAuth.getUser(uid);
    const fromAuth = normalizeEmail(authUser?.email || '');

    if (fromAuth) {
      return fromAuth;
    }
  } catch (error) {
    void error;
  }

  try {
    const userDoc = await adminDb.collection('usuario').doc(uid).get();

    if (!userDoc.exists) {
      return '';
    }

    const data = userDoc.data() || {};
    return normalizeEmail(data.Email || data.email || '');
  } catch (error) {
    void error;
    return '';
  }
}

//Inicio Firebase.
function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Faltan variables FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY en backend.',
    );
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

//Obtengo los servicios de administrador de Firebase.
function getAdminServices() {
  initializeFirebaseAdmin();

  return {
    adminAuth: getAuth(),
    adminDb: getFirestore(),
  };
}

function isAdminRoleValue(role) {
  return String(role || '').toLowerCase().includes('admin');
}

//Obtengo el rol del usuario para validar si es admin o no.
async function getUserRole(adminDb, uid) {
  const snapshot = await adminDb.collection('usuario').doc(uid).get();

  if (!snapshot.exists) {
    return '';
  }

  const data = snapshot.data() || {};
  return data.Rol || data.rol || '';
}

async function assertAdminRequest(adminDb, uid) {
  const role = await getUserRole(adminDb, uid);

  if (!isAdminRoleValue(role)) {
    throw new Error('Solo administradores pueden usar esta acción.');
  }
}

//Elimina todos los documentos de una coleccion.
async function deleteDocsInCollection(collectionRef) {
  const snapshots = await collectionRef.get();

  for (const docSnapshot of snapshots.docs) {
    await docSnapshot.ref.delete();
  }

  return snapshots.size;
}

//Elimino los documentos de una coleccion que cumplan con la condicion dada.
async function deleteDocsByPredicate(collectionRef, predicate) {
  const snapshots = await collectionRef.get();
  let deleted = 0;

  for (const docSnapshot of snapshots.docs) {
    if (!predicate(docSnapshot)) {
      continue;
    }

    await docSnapshot.ref.delete();
    deleted += 1;
  }

  return deleted;
}

//Elimino los reportes relacionados a un usuario u objeto especifico.
async function deleteMatchingReports(adminDb, predicate) {
  const rootReportsRef = adminDb.collection('Reportes');
  const resolvedReportsRef = adminDb.collection('Reportes').doc('Estados').collection('Resueltos');
  const dismissedReportsRef = adminDb.collection('Reportes').doc('Estados').collection('Desestimados');

  let deleted = 0;
  deleted += await deleteDocsByPredicate(rootReportsRef, (docSnapshot) => predicate(docSnapshot.data() || {}));
  deleted += await deleteDocsByPredicate(resolvedReportsRef, (docSnapshot) => predicate(docSnapshot.data() || {}));
  deleted += await deleteDocsByPredicate(dismissedReportsRef, (docSnapshot) => predicate(docSnapshot.data() || {}));

  return deleted;
}

//Elimino las notificaciones relacionadas a un usuario especifico.
async function deleteMatchingNotifications(adminDb, predicate) {
  const notificationsRef = adminDb.collection('notificaciones');
  return deleteDocsByPredicate(notificationsRef, (docSnapshot) => predicate(docSnapshot.data() || {}));
}

//Elimino los documentos de las subcolecciones que tengan un campo igual al valor dado, 
// y ajusto los contadores en el documento padre si es necesario.
async function deleteGroupedSubcollectionDocs(adminDb, collectionName, fieldName, fieldValue) {
  const snapshots = await adminDb.collectionGroup(collectionName).get();
  const parentAdjustments = new Map();
  let deleted = 0;

  for (const docSnapshot of snapshots.docs) {
    const data = docSnapshot.data() || {};

    if (data[fieldName] !== fieldValue) {
      continue;
    }

    const parentReference = docSnapshot.ref.parent.parent;
    const grandparentCollection = parentReference?.parent?.id || '';
    let countField = '';

    if (collectionName === 'likes') {
      if (grandparentCollection === 'actividades') {
        countField = 'likesCount';
      } else if (grandparentCollection === 'listasTematicas') {
        countField = 'CantidadLikes';
      }
    }

    if (collectionName === 'comentarios') {
      if (grandparentCollection === 'actividades') {
        countField = 'commentsCount';
      } else if (grandparentCollection === 'listasTematicas') {
        countField = 'CantidadComentarios';
      }
    }

    await docSnapshot.ref.delete();
    deleted += 1;

    if (parentReference && countField) {
      const key = `${parentReference.path}::${countField}`;
      parentAdjustments.set(key, (parentAdjustments.get(key) || 0) + 1);
    }
  }

  for (const [key, delta] of parentAdjustments.entries()) {
    const [parentPath, countField] = key.split('::');
    const parentSnapshot = await adminDb.doc(parentPath).get();

    if (!parentSnapshot.exists) {
      continue;
    }

    const parentData = parentSnapshot.data() || {};
    const currentCount = Number(parentData[countField] || 0);

    await adminDb.doc(parentPath).update({
      [countField]: Math.max(0, currentCount - delta),
    });
  }

  return deleted;
}

//Elimino las referencias de amistad de un usuario y actualizo los contadores 
// de amigos en los perfiles.
async function deleteFriendReferencesAndUpdateCounts(adminDb, uid) {
  const ownFriendsSnapshot = await adminDb.collection('usuario').doc(uid).collection('Amigos').get();
  let deleted = 0;

  for (const friendDoc of ownFriendsSnapshot.docs) {
    const data = friendDoc.data() || {};
    const friendUid = data.UserID || friendDoc.id;

    if (!friendUid || friendUid === uid) {
      continue;
    }

    try {
      await adminDb.collection('usuario').doc(friendUid).collection('Amigos').doc(uid).delete();
      await adminDb.collection('usuario').doc(friendUid).update({
        cantidadAmigos: FieldValue.increment(-1),
      });
      deleted += 1;
    } catch (error) {
      console.error('Warning: no se pudo limpiar amistad en cascada:', error?.message || error);
    }
  }

  return deleted;
}

//Elimino las referencias de comics y tomos de un usuario en sus listas, 
// y actualizo los contadores en su perfil.
async function deleteUserComicReferencesAndUpdateCounts(adminDb, comicId, volumeId = null) {
  const volumeFieldNames = ['TomoID', 'VolumeId'];
  const listTypes = ['biblioteca', 'listaDeseados'];
  const usersSnapshot = await adminDb.collection('usuario').get();
  const containers = new Map();
  let deleted = 0;

  for (const userSnapshot of usersSnapshot.docs) {
    const ownerUid = userSnapshot.id;

    for (const listType of listTypes) {
      const containerRef = adminDb
        .collection('usuario')
        .doc(ownerUid)
        .collection(listType)
        .doc('coleccion')
        .collection('comics')
        .doc(comicId);

      const volumeSnapshots = await containerRef.collection('tomos').get();

      if (volumeSnapshots.empty) {
        continue;
      }

      const docsToDelete = [];

      for (const volumeSnapshot of volumeSnapshots.docs) {
        if (!volumeId) {
          docsToDelete.push(volumeSnapshot.ref);
          continue;
        }

        const data = volumeSnapshot.data() || {};
        const matchesByField = volumeFieldNames.some((fieldName) => String(data[fieldName] || '') === String(volumeId));
        const matchesByDocId = volumeSnapshot.id === volumeId;

        if (matchesByField || matchesByDocId) {
          docsToDelete.push(volumeSnapshot.ref);
        }
      }

      if (docsToDelete.length === 0) {
        continue;
      }

      const containerKey = `${ownerUid}::${listType}`;
      containers.set(containerKey, {
        ownerUid,
        listType,
        containerPath: containerRef.path,
        docsToDelete,
      });
    }
  }

  for (const container of containers.values()) {
    const { ownerUid, listType, containerPath, totalTomos, docsToDelete } = container;

    if (docsToDelete.length === 0) {
      continue;
    }

    for (const docRef of docsToDelete) {
      await docRef.delete();
      deleted += 1;
    }

    const tomosCollectionRef = adminDb.doc(containerPath).collection('tomos');
    const existingSnapshot = await tomosCollectionRef.limit(docsToDelete.length + 1).get();
    const remainingTomos = Math.max(0, existingSnapshot.size - docsToDelete.length);

    if (listType === 'biblioteca') {
      const updatePayload = {};
      const tomosDelta = docsToDelete.length;
      const comicsDelta = volumeId ? (remainingTomos === 0 ? 1 : 0) : 1;

      if (tomosDelta > 0) {
        updatePayload.totalTomos = FieldValue.increment(-tomosDelta);
      }

      if (comicsDelta > 0) {
        updatePayload.totalComics = FieldValue.increment(-comicsDelta);
      }

      if (Object.keys(updatePayload).length > 0) {
        await adminDb.collection('usuario').doc(ownerUid).update(updatePayload);
      }
    }

    if (remainingTomos === 0) {
      await adminDb.doc(containerPath).delete();
    }
  }

  return deleted;
}

//Elimino las menciones de un comic o tomo en las actividades, 
// y si quedan sin menciones las elimino completamente.
async function pruneActivityMentionsByVolume(adminDb, matchesVolume) {
  const activitiesRef = adminDb.collection('actividades');
  const snapshots = await activitiesRef.get();
  let deletedOrPruned = 0;

  for (const activityDoc of snapshots.docs) {
    const data = activityDoc.data() || {};
    const payload = data.payload || {};
    const volumes = Array.isArray(payload.volumes) ? payload.volumes : null;

    if (!volumes) {
      continue;
    }

    const nextVolumes = volumes.filter((entry) => !matchesVolume(entry || {}));

    if (nextVolumes.length === volumes.length) {
      continue;
    }

    if (nextVolumes.length === 0) {
      await adminDb.recursiveDelete(activityDoc.ref);
      deletedOrPruned += 1;
      continue;
    }

    await activityDoc.ref.update({
      payload: {
        ...payload,
        volumes: nextVolumes,
        count: nextVolumes.length,
      },
    });
    deletedOrPruned += 1;
  }

  return deletedOrPruned;
}

//Elimino las menciones de una lista temática en las actividades.
async function pruneActivityMentionsByList(adminDb, matchesList) {
  const activitiesRef = adminDb.collection('actividades');
  const snapshots = await activitiesRef.get();
  let deletedOrPruned = 0;

  for (const activityDoc of snapshots.docs) {
    const data = activityDoc.data() || {};
    const payload = data.payload || {};
    const lists = Array.isArray(payload.lists) ? payload.lists : null;

    if (!lists) {
      continue;
    }

    const nextLists = lists.filter((entry) => !matchesList(entry || {}));

    if (nextLists.length === lists.length) {
      continue;
    }

    if (nextLists.length === 0) {
      await adminDb.recursiveDelete(activityDoc.ref);
      deletedOrPruned += 1;
      continue;
    }

    await activityDoc.ref.update({
      payload: {
        ...payload,
        lists: nextLists,
        count: nextLists.length,
      },
    });
    deletedOrPruned += 1;
  }

  return deletedOrPruned;
}

//Elimino un canal de StreamChat y su documento en Firestore.
async function deleteStreamChannelAndMapping(adminDb, channelId) {
  if (!channelId) {
    return false;
  }

  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('Stream API key/secret no configurados.');
  }

  const serverClient = new StreamChat(apiKey, apiSecret);
  const channel = serverClient.channel('messaging', channelId);

  try {
    await channel.delete();
  } catch (error) {
    console.error('Adventencia: No se pudo eliminar el canal en StreamChat:', error?.message || error);
  }

  try {
    await adminDb.collection('streamChannels').doc(channelId).delete();
  } catch (error) {
    console.error('Adventencia: no se pudo eliminar el documento de streamChannels:', error?.message || error);
  }

  return true;
}

//Elimino los canales de StreamChat relacionados a un usuario por ser creador, miembro o admin,
async function deleteUserStreamChannels(adminDb, uid) {
  const channelsRef = adminDb.collection('streamChannels');
  const snapshots = await channelsRef.get();
  const channelIds = new Set();

  for (const channelSnapshot of snapshots.docs) {
    const data = channelSnapshot.data() || {};
    const members = Array.isArray(data.members) ? data.members : [];
    const admins = Array.isArray(data.admins) ? data.admins : [];

    if (
      data.createdBy === uid ||
      members.includes(uid) ||
      admins.includes(uid)
    ) {
      channelIds.add(channelSnapshot.id);
    }
  }

  for (const channelId of channelIds) {
    await deleteStreamChannelAndMapping(adminDb, channelId);
  }

  return channelIds.size;
}

//Elimino las listas temáticas creadas por un usuario y todo su contenido relacionado.
async function deleteUserOwnedThematicLists(adminDb, uid) {
  const listsRef = adminDb.collection('listasTematicas');
  const snapshots = await listsRef.get();
  const ownedListIds = new Set();

  for (const listSnapshot of snapshots.docs) {
    const data = listSnapshot.data() || {};
    const ownerCandidates = [data.UserID, data.UserId, data.userId, data.UID, data.uid];

    if (ownerCandidates.includes(uid)) {
      ownedListIds.add(listSnapshot.id);
    }
  }

  for (const listId of ownedListIds) {
    try {
      await deleteThematicListCascade(adminDb, listId);
    } catch (error) {
      console.error('Adventencia: No se pudo eliminar lista temática:', error?.message || error);
    }
  }

  return ownedListIds.size;
}

//Elimino las reseñas de un usuario.
async function deleteUserReviewsWithAggregateUpdate(adminDb, uid) {
  const reviewsSnapshots = await adminDb.collectionGroup('Resenas').get();
  const reviewsByComicId = new Map();
  let deletedReviews = 0;

  for (const reviewSnapshot of reviewsSnapshots.docs) {
    const reviewData = reviewSnapshot.data() || {};
    const reviewUserIdFields = [reviewData.UserID, reviewData.userId, reviewData.uid];

    if (!reviewUserIdFields.includes(uid)) {
      continue;
    }

    const path = reviewSnapshot.ref.path;
    const pathParts = path.split('/');
    
    if (pathParts[0] !== 'comics' || pathParts[2] !== 'Resenas') {
      continue;
    }

    const comicId = pathParts[1];
    const rating = reviewData.Calificacion ?? 0;

    if (!reviewsByComicId.has(comicId)) {
      reviewsByComicId.set(comicId, { count: 0, sum: 0, reviews: [] });
    }

    const comicData = reviewsByComicId.get(comicId);
    comicData.count += 1;
    comicData.sum += rating;
    comicData.reviews.push(reviewSnapshot.ref);
  }

  for (const [comicId, comicData] of reviewsByComicId.entries()) {
    const comicRef = adminDb.collection('comics').doc(comicId);

    try {
      await adminDb.runTransaction(async (transaction) => {
        const comicSnapshot = await transaction.get(comicRef);

        if (!comicSnapshot.exists) {
          return;
        }

        const comicDataDoc = comicSnapshot.data() || {};
        const currentCount = comicDataDoc.CantidadCalificaciones ?? 0;
        const currentSum = comicDataDoc.PromedioCalificacion ?? 0;


        const newCount = Math.max(0, currentCount - comicData.count);
        let newSum = currentSum;

        let totalSum = currentCount > 0 ? currentSum * currentCount : 0;
        totalSum = Math.max(0, totalSum - comicData.sum);

        if (newCount === 0) {
            //Si no quedan reseñas, limpio los campos de cantidad y promedio.
          transaction.update(comicRef, {
            CantidadCalificaciones: 0,
            PromedioCalificacion: null,
          });
        } else {
          //Calculo nuevo promedio.
          const newAverage = totalSum / newCount;
          transaction.update(comicRef, {
            CantidadCalificaciones: newCount,
            PromedioCalificacion: newAverage,
          });
        }

        //Borro todas las reseñas del usuario para este comic.
        for (const reviewRef of comicData.reviews) {
          transaction.delete(reviewRef);
        }
      });

      deletedReviews += comicData.reviews.length;
    } catch (error) {
      console.error(`Advertencia: No se pudo actualizar los totales calculados para el comic ${comicId}:`, error?.message || error);
    }
  }

  return deletedReviews;
}

//Elimino todos los datos de un usuario, incluyendo su perfil, referencias en otras colecciones, 
// actividades, notificaciones, reportes, amistades, listas tematicas y canales de StreamChat.
async function deleteUserDataWithFullCleanup(adminDb, uid) {
  const referenceFields = getReferenceFields();
  const summary = {
    usuario: 0,
    rootMatches: 0,
    friends: 0,
    notifications: 0,
    reportes: 0,
    activities: 0,
    streamChannels: 0,
    comments: 0,
    likes: 0,
    thematicLists: 0,
    reviews: 0,
  };

  //Elimino listas tematicas creadas por el usuario y sus referencias,
  summary.thematicLists = await deleteUserOwnedThematicLists(adminDb, uid);
  summary.friends = await deleteFriendReferencesAndUpdateCounts(adminDb, uid);

  //Elimino reseñas y actualizo los totales calculados de comics.
  summary.reviews = await deleteUserReviewsWithAggregateUpdate(adminDb, uid);

  const userProfileRef = adminDb.collection('usuario').doc(uid);
  const userProfileSnapshot = await userProfileRef.get();

  if (userProfileSnapshot.exists) {
    await adminDb.recursiveDelete(userProfileRef);
    summary.usuario = 1;
  }

  const rootCollections = await adminDb.listCollections();

  for (const collectionRef of rootCollections) {
    for (const fieldName of referenceFields) {
      const snapshots = await collectionRef.where(fieldName, '==', uid).get();

      for (const documentSnapshot of snapshots.docs) {
        await adminDb.recursiveDelete(documentSnapshot.ref);
        summary.rootMatches += 1;
      }
    }
  }

  summary.notifications = await deleteMatchingNotifications(adminDb, (data) => {
    return data.UserID === uid || data.userId === uid || data.ActorUserID === uid || data.actorUid === uid;
  });

  summary.reportes = await deleteMatchingReports(adminDb, (data) => {
    return data.UsuarioIdReporta === uid || data.ObjetoReportadoID === uid;
  });

  summary.activities = await deleteDocsByPredicate(adminDb.collection('actividades'), (docSnapshot) => {
    const data = docSnapshot.data() || {};
    return data.UserID === uid || data.actorUid === uid;
  });

  summary.comments += await deleteGroupedSubcollectionDocs(adminDb, 'comentarios', 'UserID', uid);
  summary.comments += await deleteGroupedSubcollectionDocs(adminDb, 'comentarios', 'uid', uid);
  summary.comments += await deleteGroupedSubcollectionDocs(adminDb, 'comentarios', 'UserId', uid);
  summary.likes += await deleteGroupedSubcollectionDocs(adminDb, 'likes', 'UserID', uid);
  summary.likes += await deleteGroupedSubcollectionDocs(adminDb, 'likes', 'uid', uid);
  summary.likes += await deleteGroupedSubcollectionDocs(adminDb, 'likes', 'UserId', uid);

  summary.streamChannels = await deleteUserStreamChannels(adminDb, uid);

  return summary;
}

//Elimino un comic y todo su contenido relacionado, 
// incluyendo referencias en listas de usuarios, reportes, actividades, notificaciones y subcolecciones.
async function deleteComicCascade(adminDb, comicId) {
  if (!comicId) {
    throw new Error('comicId es obligatorio.');
  }

  const comicRef = adminDb.collection('comics').doc(comicId);
  const comicSnapshot = await comicRef.get();

  if (!comicSnapshot.exists) {
    throw new Error('No se encontró el comic.');
  }

  await deleteUserComicReferencesAndUpdateCounts(adminDb, comicId);

  await deleteMatchingReports(adminDb, (data) => {
    return (
      (data.NombreObjetoReportado || '').toLowerCase() === 'comic' &&
      data.ObjetoReportadoID === comicId
    ) || (
      (data.NombreObjetoReportado || '').toLowerCase() === 'tomo' &&
      data.ComicId === comicId
    );
  });

  await pruneActivityMentionsByVolume(adminDb, (entry) => entry?.comicId === comicId);

  await adminDb.recursiveDelete(comicRef);

  return true;
}

//Elimino un tomo y todo su contenido relacionado, 
// incluyendo referencias en listas de usuarios, reportes, actividades, notificaciones y subcolecciones.
async function deleteVolumeCascade(adminDb, comicId, volumeId) {
  if (!comicId || !volumeId) {
    throw new Error('comicId y volumeId son obligatorios.');
  }

  const comicRef = adminDb.collection('comics').doc(comicId);
  const volumeRef = comicRef.collection('tomos').doc(volumeId);
  const volumeSnapshot = await volumeRef.get();

  if (!volumeSnapshot.exists) {
    throw new Error('No se encontró el tomo.');
  }

  await deleteUserComicReferencesAndUpdateCounts(adminDb, comicId, volumeId);

  await deleteMatchingReports(adminDb, (data) => {
    return (
      (data.NombreObjetoReportado || '').toLowerCase() === 'tomo' &&
      data.ComicId === comicId &&
      data.ObjetoReportadoID === volumeId
    );
  });

  await pruneActivityMentionsByVolume(adminDb, (entry) => {
    return entry?.comicId === comicId && entry?.volumeId === volumeId;
  });

  //Elimino el tomo de todas las listas tematicas.
  const thematicListsRef = adminDb.collection('listasTematicas');
  const allThematicListsSnapshot = await thematicListsRef.get();
  
  for (const listSnapshot of allThematicListsSnapshot.docs) {
    const tomosDeLista = listSnapshot.ref.collection('tomosDeLista');
    const volumesInList = await tomosDeLista.where('TomoId', '==', volumeId).where('ComicId', '==', comicId).get();
    
    for (const volumeDoc of volumesInList.docs) {
      await volumeDoc.ref.delete();
    }
  }

  await volumeRef.delete();

  //Si el comic no tiene mas tomos, elimino el comic tambien.
  const remainingVolumesSnapshot = await comicRef.collection('tomos').limit(1).get();

  if (remainingVolumesSnapshot.empty) {
    //Elimino el comic y todo su contenido relacionado.
    await deleteComicCascade(adminDb, comicId);
    return { comicDeleted: true };
  }

  return { comicDeleted: false };
}

//Elimino una lista tematica y todo su contenido relacionado, 
// incluyendo referencias en actividades, reportes, notificaciones y subcolecciones.
async function deleteThematicListCascade(adminDb, listId) {
  if (!listId) {
    throw new Error('listId es obligatorio.');
  }

  const listRef = adminDb.collection('listasTematicas').doc(listId);
  const listSnapshot = await listRef.get();

  if (!listSnapshot.exists) {
    throw new Error('No se encontró la lista temática.');
  }

  await pruneActivityMentionsByList(adminDb, (entry) => entry?.id === listId);

  const savedListSnapshots = await adminDb.collectionGroup('listasGuardadas').get();

  for (const savedSnapshot of savedListSnapshots.docs) {
    if (savedSnapshot.id !== listId) {
      continue;
    }

    await savedSnapshot.ref.delete();
  }

  await adminDb.recursiveDelete(listRef);

  return true;
}

//Elimino un grupo de chat.
async function deleteGroupCascade(adminDb, channelId) {
  if (!channelId) {
    throw new Error('channelId es obligatorio.');
  }

  await deleteMatchingReports(adminDb, (data) => {
    return (
      (data.NombreObjetoReportado || '').toLowerCase() === 'grupo de chat' &&
      data.ObjetoReportadoID === channelId
    );
  });

  await deleteStreamChannelAndMapping(adminDb, channelId);
  return true;
}

//Elimino el perfil de usuario y referencias a su UID.
async function deleteUserDataAcrossCollections(adminDb, uid) {
  const referenceFields = getReferenceFields();
  const deletedDocPaths = [];
  const deletionSummary = {};

  //1.Elimino el documento del usuario en la coleccion raiz 'usuario'
  const userProfileRef = adminDb.collection('usuario').doc(uid);
  const userProfileSnapshot = await userProfileRef.get();

  if (userProfileSnapshot.exists) {
    await adminDb.recursiveDelete(userProfileRef);
    deletedDocPaths.push(userProfileRef.path);
    deletionSummary['usuario'] = 1;
  }

  //2.Busco y elimino documentos en todas las colecciones raíz que referencien al usuario.
  const rootCollections = await adminDb.listCollections();

  for (const collectionRef of rootCollections) {
    const collectionName = collectionRef.id;
    let deletedInCollection = 0;

    for (const fieldName of referenceFields) {
      try {
        const matchingDocs = await collectionRef.where(fieldName, '==', uid).get();

        for (const documentSnapshot of matchingDocs.docs) {
          const path = documentSnapshot.ref.path;

          //Evito duplicados si el documento ya fue eliminado.
          if (!deletedDocPaths.includes(path)) {
            await adminDb.recursiveDelete(documentSnapshot.ref);
            deletedDocPaths.push(path);
            deletedInCollection++;
          }
        }
      } catch (error) {
        continue;
      }
    }

    if (deletedInCollection > 0) {
      deletionSummary[collectionName] = deletedInCollection;
    }
  }

  return {
    deletedDocuments: deletedDocPaths.length,
    deletedPaths: deletedDocPaths,
    deletionSummary,
    referenceFields,
  };
}

//Elimino las actividades donde el usuario es actor o sujeto, 
// y las interacciones que haya hecho el usuario en actividades de otros, 
// ajustando los contadores correspondientes.
async function deleteActivityAssociations(adminDb, uid) {
  const activitiesRef = adminDb.collection('actividades');
  const activitiesSnapshot = await activitiesRef.get();
  let deletedActivities = 0;
  let deletedLikes = 0;
  let deletedComments = 0;

  for (const activityDoc of activitiesSnapshot.docs) {
    const activityData = activityDoc.data() || {};

    if (activityData.UserID === uid || activityData.actorUid === uid) {
      await adminDb.recursiveDelete(activityDoc.ref);
      deletedActivities += 1;
      continue;
    }

    const likeRef = activityDoc.ref.collection('likes').doc(uid);
    const likeSnapshot = await likeRef.get();

    if (likeSnapshot.exists) {
      await likeRef.delete();
      deletedLikes += 1;
      try {
        await activityDoc.ref.set(
          { likesCount: Math.max(0, Number(activityData.likesCount || 0) - 1) },
          { merge: true },
        );
      } catch (error) {
        void error;
      }
    }

    const commentsSnapshots = await Promise.all([
      activityDoc.ref.collection('comentarios').where('UserID', '==', uid).get(),
      activityDoc.ref.collection('comentarios').where('uid', '==', uid).get(),
    ]);

    const commentsSnapshot = {
      empty: commentsSnapshots.every((snapshot) => snapshot.empty),
      size: commentsSnapshots.reduce((total, snapshot) => total + snapshot.size, 0),
      docs: commentsSnapshots.flatMap((snapshot) => snapshot.docs),
    };

    if (!commentsSnapshot.empty) {
      for (const commentDoc of commentsSnapshot.docs) {
        await commentDoc.ref.delete();
        deletedComments += 1;
      }

      try {
        const nextComments = Math.max(
          0,
          Number(activityData.commentsCount || 0) - commentsSnapshot.size,
        );

        await activityDoc.ref.set(
          { commentsCount: nextComments },
          { merge: true },
        );
      } catch (error) {
        void error;
      }
    }
  }

  return {
    deletedActivities,
    deletedLikes,
    deletedComments,
  };
}

async function deleteUserDataWithActivityCleanup(adminDb, uid) {
  const baseSummary = await deleteUserDataAcrossCollections(adminDb, uid);
  const activityCleanup = await deleteActivityAssociations(adminDb, uid);

  const deletionSummary = {
    ...baseSummary.deletionSummary,
    actividades:
      (baseSummary.deletionSummary.actividades || 0) +
      activityCleanup.deletedActivities,
    actividadLikesEliminados: activityCleanup.deletedLikes,
    actividadComentariosEliminados: activityCleanup.deletedComments,
  };

  return {
    ...baseSummary,
    deletionSummary,
  };
}

//Endpoint: Valido si un email esta bloqueado para registro.
app.post('/api/auth/validate-registration-email', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || '');

    if (!email) {
      return res.status(400).json({ ok: false, message: 'El email es obligatorio.' });
    }

    const { adminDb } = getAdminServices();
    const blocked = await isEmailBlockedForRegistration(adminDb, email);

    return res.json({
      ok: true,
      blocked,
      message: blocked
        ? 'Este correo no puede registrarse nuevamente.'
        : 'Correo permitido para registro.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible validar el correo.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Elimino la cuenta del usuario autenticado y todos sus datos relacionados.
app.delete('/api/users/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        message: 'Falta token de autorización.',
      });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();

    if (!idToken) {
      return res.status(401).json({
        ok: false,
        message: 'Token de autorización inválido.',
      });
    }

    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const deletionSummary = await deleteUserDataWithFullCleanup(adminDb, uid);
    await adminAuth.deleteUser(uid);

    return res.json({
      ok: true,
      uid,
      ...deletionSummary,
      message: 'Cuenta y datos de usuario eliminados correctamente.',
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'No fue posible eliminar la cuenta de usuario.';

    return res.status(500).json({
      ok: false,
      message,
    });
  }
});

//Endpoint: Elimino la cuenta de un usuario especifico y todos sus datos relacionados.
// Esto se usa cuando un admin elimina una cuenta.
app.delete('/api/admin/users/:uid', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();

    if (!idToken) {
      return res.status(401).json({ ok: false, message: 'Token de autorización inválido.' });
    }

    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    await assertAdminRequest(adminDb, decodedToken.uid);

    const { uid } = req.params;
    const emailToBlock = await resolveUserEmailForBlocking(adminAuth, adminDb, uid);
    const deletionSummary = await deleteUserDataWithFullCleanup(adminDb, uid);
    const emailBlocked = await blockEmailForFutureRegistration(adminDb, {
      email: emailToBlock,
      blockedByUid: decodedToken.uid,
      deletedUid: uid,
    });

    try {
      await adminAuth.deleteUser(uid);
    } catch (error) {
      console.error('Advertencia: No se pudo eliminar el usuario de Auth:', error?.message || error);
    }

    return res.json({
      ok: true,
      uid,
      emailBlocked,
      ...deletionSummary,
      message: 'Cuenta de usuario eliminada correctamente.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible eliminar la cuenta del usuario.';

    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Elimino un comic y todo su contenido relacionado.
app.delete('/api/admin/comics/:comicId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    await assertAdminRequest(adminDb, decodedToken.uid);

    await deleteComicCascade(adminDb, req.params.comicId);

    return res.json({ ok: true, message: 'Comic eliminado correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible eliminar el comic.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Elimino un tomo y todo su contenido relacionado. Si el comic queda sin tomos, se elimina tambien.
app.delete('/api/admin/comics/:comicId/volumes/:volumeId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    await assertAdminRequest(adminDb, decodedToken.uid);

    const result = await deleteVolumeCascade(adminDb, req.params.comicId, req.params.volumeId);

    if (result && result.comicDeleted) {
      return res.json({ ok: true, comicDeleted: true, message: 'Tomo eliminado. El cómic quedó sin tomos y fue eliminado automáticamente.' });
    }

    return res.json({ ok: true, comicDeleted: false, message: 'Tomo eliminado correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible eliminar el tomo.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Elimino una lista temática y todo su contenido relacionado.
app.delete('/api/admin/thematic-lists/:listId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    await assertAdminRequest(adminDb, decodedToken.uid);

    await deleteThematicListCascade(adminDb, req.params.listId);

    return res.json({ ok: true, message: 'Lista temática eliminada correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible eliminar la lista temática.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Elimino un grupo de chat y todo su contenido relacionado.
app.delete('/api/admin/channels/:channelId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    const channelDoc = await adminDb.collection('streamChannels').doc(req.params.channelId).get();
    if (!channelDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Grupo no encontrado.' });
    }

    const channelData = channelDoc.data() || {};
    const isGroupAdmin = Array.isArray(channelData.admins) && channelData.admins.includes(decodedToken.uid);

    if (!isGroupAdmin) {
      return res.status(403).json({ ok: false, message: 'Solo los administradores del grupo pueden eliminarlo.' });
    }

    await deleteGroupCascade(adminDb, req.params.channelId);

    return res.json({ ok: true, message: 'Grupo eliminado correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible eliminar el grupo.';
    return res.status(500).json({ ok: false, message });
  }
});

// Endpoint: Genero token de StreamChat para un usuario autenticado.
app.post('/api/stream/token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();

    if (!idToken) {
      return res.status(401).json({ ok: false, message: 'Token de autorización inválido.' });
    }

    const { adminAuth } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, message: 'Stream API key/secret no configurados.' });
    }

    const serverClient = new StreamChat(apiKey, apiSecret);

    try {
      const userRecord = await getFirestore().collection('usuario').doc(uid).get();
      const profile = userRecord.exists ? userRecord.data() : null;

      //Upsert: Update e Insert. Si el usuario no existe, lo crea. Si existe, actualiza su nombre e imagen.
      await serverClient.upsertUser({
        id: uid,
        name: profile?.nick || profile?.Nick || uid,
        image: getSafeStreamImage(profile),
      });
    } catch (err) {
      console.error('Advertencia: No se pudo upsertUser en StreamChat:', err?.message || err);
    }

    const token = serverClient.createToken(uid);

    return res.json({ ok: true, token, apiKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible crear token Stream.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Creo canal en StreamChat con validacion de amistad para chat 1:1.
app.post('/api/stream/channels/create', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();

    if (!idToken) {
      return res.status(401).json({ ok: false, message: 'Token de autorización inválido.' });
    }

    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    const { type = 'messaging', members = [], metadata = {}, groupName = null, groupDescription = null, groupImageUrl = null } = req.body || {};

    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ ok: false, message: 'members es obligatorio.' });
    }

    if (members.length > 2 && typeof groupName !== 'string') {
      return res.status(400).json({ ok: false, message: 'groupName es obligatorio para grupos.' });
    }

    const sanitizedName = groupName ? groupName.trim().slice(0, 100) : null;
    const sanitizedDescription = groupDescription ? groupDescription.trim().slice(0, 1000) : null;

    if (members.length === 2) {
      if (!members.includes(requesterUid)) {
        return res.status(403).json({ ok: false, message: 'No autorizado para crear este chat 1:1.' });
      }

      const otherUid = members.find((m) => m !== requesterUid);

      const friendDoc = await adminDb.collection('usuario').doc(requesterUid).collection('Amigos').doc(otherUid).get();

      if (!friendDoc.exists) {
        return res.status(403).json({ ok: false, message: 'Solo puedes crear chat 1:1 con amigos.' });
      }
    } else {
      for (const uid of members) {
        if (uid === requesterUid) continue;
        const friendDoc = await adminDb.collection('usuario').doc(requesterUid).collection('Amigos').doc(uid).get();
        if (!friendDoc.exists) {
          return res.status(403).json({ ok: false, message: `Debes ser amigo del usuario ${uid} para añadirlo al grupo.` });
        }
      }
    }

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, message: 'Stream API key/secret no configurados.' });
    }

    const serverClient = new StreamChat(apiKey, apiSecret);

    const streamUsers = await Promise.all(
      members.map(async (memberUid) => {
        try {
          const userRecord = await adminDb.collection('usuario').doc(memberUid).get();
          const profile = userRecord.exists ? userRecord.data() : null;

          return {
            id: memberUid,
            name: profile?.Nick || profile?.nick || memberUid,
            image: getSafeStreamImage(profile),
          };
        } catch {
          return {
            id: memberUid,
            name: memberUid,
          };
        }
      }),
    );

    await serverClient.upsertUsers(streamUsers);

    let channelId = null;
    const channelType = 'messaging';

    if (members.length === 2) {
      const sorted = [...members].sort();
      channelId = `dm-${sorted.join('-')}`;
    } else {
      channelId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const channel = serverClient.channel(channelType, channelId, {
      name: sanitizedName || metadata.name || null,
      created_by: { id: requesterUid },
      members,
      ...metadata,
    });

    const customData = {
      groupName: sanitizedName,
      groupDescription: sanitizedDescription,
      admins: [requesterUid],
    };

    await channel.create();

    try {
      await channel.update(customData);
    } catch (err) {
      console.error('Advertencia: No se pudo actualizar datos custom del canal:', err?.message || err);
    }

    try {
      await adminDb.collection('streamChannels').doc(channelId).set({
        streamChannelId: channelId,
        type: members.length === 2 ? 'personal' : 'group',
        members,
        admins: [requesterUid],
        createdBy: requesterUid,
        groupName: sanitizedName,
        groupDescription: sanitizedDescription,
        groupImageUrl: groupImageUrl || null,
        metadata,
        createdAt: new Date(),
      });
    } catch (err) {
      console.error('Advertencia: No se pudo persistir streamChannels mapping:', err?.message || err);
    }

    return res.json({ ok: true, channel: { id: channelId, type: channelType, members } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible crear canal de StreamChat.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Actualizo datos de un canal de StreamChat, solo si el usuario es admin del grupo.
app.post('/api/stream/channels/:channelId/update', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    const { channelId } = req.params;
    const { groupName, groupDescription, groupImageUrl } = req.body || {};

    const channelDoc = await adminDb.collection('streamChannels').doc(channelId).get();
    if (!channelDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Canal no encontrado.' });
    }

    const channelData = channelDoc.data();
    const isAdmin = channelData.admins && channelData.admins.includes(requesterUid);
    if (!isAdmin) {
      return res.status(403).json({ ok: false, message: 'Solo los administradores del grupo pueden editar estos datos.' });
    }

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, message: 'Stream API key/secret no configurados.' });
    }

    const serverClient = new StreamChat(apiKey, apiSecret);
    const channel = serverClient.channel('messaging', channelId);

    const hasGroupImageUrl = Object.prototype.hasOwnProperty.call(req.body || {}, 'groupImageUrl');
    const sanitizedName = groupName ? groupName.trim().slice(0, 100) : channelData.groupName;
    const sanitizedDescription = groupDescription ? groupDescription.trim().slice(0, 1000) : channelData.groupDescription;
    const nextGroupImageUrl = hasGroupImageUrl ? groupImageUrl : channelData.groupImageUrl;

    const updateData = {
      groupName: sanitizedName,
      groupDescription: sanitizedDescription,
    };

    await channel.update(updateData);

    await adminDb.collection('streamChannels').doc(channelId).update({
      groupName: sanitizedName,
      groupDescription: sanitizedDescription,
      groupImageUrl: nextGroupImageUrl ?? null,
    });

    return res.json({ ok: true, message: 'Grupo actualizado correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible actualizar el grupo.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Agrego miembros a un canal de StreamChat, solo si el usuario es admin del grupo.
app.post('/api/stream/channels/:channelId/add-members', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    const { channelId } = req.params;
    const { newMemberUids = [] } = req.body || {};

    if (!Array.isArray(newMemberUids) || newMemberUids.length === 0) {
      return res.status(400).json({ ok: false, message: 'newMemberUids debe ser un array no vacío.' });
    }

    const channelDoc = await adminDb.collection('streamChannels').doc(channelId).get();
    if (!channelDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Canal no encontrado.' });
    }

    const channelData = channelDoc.data();
    const isAdmin = channelData.admins && channelData.admins.includes(requesterUid);
    if (!isAdmin) {
      return res.status(403).json({ ok: false, message: 'Solo los administradores del grupo pueden agregar miembros.' });
    }

    //Valido amistad con los nuevos miembros para que el admin del grupo pueda agregarlos.
    for (const uid of newMemberUids) {
      const friendDoc = await adminDb.collection('usuario').doc(requesterUid).collection('Amigos').doc(uid).get();
      if (!friendDoc.exists) {
        return res.status(403).json({ ok: false, message: `Debes ser amigo del usuario ${uid} para añadirlo al grupo.` });
      }
    }

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, message: 'Stream API key/secret no configurados.' });
    }

    const serverClient = new StreamChat(apiKey, apiSecret);

    const newStreamUsers = await Promise.all(
      newMemberUids.map(async (memberUid) => {
        try {
          const userRecord = await adminDb.collection('usuario').doc(memberUid).get();
          const profile = userRecord.exists ? userRecord.data() : null;
          return {
            id: memberUid,
            name: profile?.Nick || profile?.nick || memberUid,
            image: getSafeStreamImage(profile),
          };
        } catch {
          return { id: memberUid, name: memberUid };
        }
      }),
    );

    await serverClient.upsertUsers(newStreamUsers);

    const channel = serverClient.channel('messaging', channelId);
    await channel.addMembers(newMemberUids);

    const updatedMembers = [...(channelData.members || []), ...newMemberUids].filter((v, i, a) => a.indexOf(v) === i);
    await adminDb.collection('streamChannels').doc(channelId).update({
      members: updatedMembers,
    });

    return res.json({ ok: true, message: 'Miembros agregados correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible agregar miembros.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Promuevo a un miembro a admin de un canal de StreamChat, solo si el usuario es admin del grupo.
app.post('/api/stream/channels/:channelId/make-admin', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    const { channelId } = req.params;
    const { userUid } = req.body || {};

    if (!userUid) {
      return res.status(400).json({ ok: false, message: 'userUid es obligatorio.' });
    }

    const channelDoc = await adminDb.collection('streamChannels').doc(channelId).get();
    if (!channelDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Canal no encontrado.' });
    }

    const channelData = channelDoc.data();
    const isAdmin = channelData.admins && channelData.admins.includes(requesterUid);
    if (!isAdmin) {
      return res.status(403).json({ ok: false, message: 'Solo los administradores del grupo pueden promover administradores.' });
    }

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, message: 'Stream API key/secret no configurados.' });
    }

    const serverClient = new StreamChat(apiKey, apiSecret);
    const channel = serverClient.channel('messaging', channelId);

    const currentAdmins = channelData.admins || [requesterUid];
    if (!currentAdmins.includes(userUid)) {
      currentAdmins.push(userUid);
    }

    await channel.update({ admins: currentAdmins });

    await adminDb.collection('streamChannels').doc(channelId).update({
      admins: currentAdmins,
    });

    return res.json({ ok: true, message: 'Usuario promovido a admin correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible promover a admin.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Permito a un miembro abandonar un canal de StreamChat.
app.post('/api/stream/channels/:channelId/leave', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    const { channelId } = req.params;

    const channelDoc = await adminDb.collection('streamChannels').doc(channelId).get();
    if (!channelDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Canal no encontrado.' });
    }

    const channelData = channelDoc.data();
    if (!channelData.members.includes(requesterUid)) {
      return res.status(403).json({ ok: false, message: 'No eres miembro de este grupo.' });
    }

    const currentAdmins = Array.isArray(channelData.admins) ? channelData.admins : [];
    const isRequesterAdmin = currentAdmins.includes(requesterUid);
    const remainingAdmins = currentAdmins.filter((uid) => uid !== requesterUid);

    if (isRequesterAdmin && remainingAdmins.length === 0) {
      return res.status(400).json({ ok: false, message: 'Debes dejar al menos un administrador en el grupo.' });
    }

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, message: 'Stream API key/secret no configurados.' });
    }

    const serverClient = new StreamChat(apiKey, apiSecret);
    const channel = serverClient.channel('messaging', channelId);

    await channel.removeMembers([requesterUid]);

    const updatedMembers = channelData.members.filter((uid) => uid !== requesterUid);
    const updatedAdmins = remainingAdmins;

    if (updatedMembers.length <= 1) {
      try {
        await channel.delete();
      } catch (err) {
        console.error('Advertencia: No se pudo eliminar el canal vacío:', err?.message || err);
      }

      await adminDb.collection('streamChannels').doc(channelId).delete();

      return res.json({ ok: true, message: 'El grupo se eliminó automáticamente porque quedó sin miembros.' });
    }

    await adminDb.collection('streamChannels').doc(channelId).update({
      members: updatedMembers,
      admins: updatedAdmins,
    });

    return res.json({ ok: true, message: 'Has abandonado el grupo correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible abandonar el grupo.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Promuevo a un miembro a admin de un canal de StreamChat.
app.post('/api/stream/channels/:channelId/remove-member', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    const { channelId } = req.params;
    const { memberUid } = req.body || {};

    if (!memberUid) {
      return res.status(400).json({ ok: false, message: 'memberUid es obligatorio.' });
    }

    const channelDoc = await adminDb.collection('streamChannels').doc(channelId).get();
    if (!channelDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Canal no encontrado.' });
    }

    const channelData = channelDoc.data();
    const isAdmin = channelData.admins && channelData.admins.includes(requesterUid);
    if (!isAdmin) {
      return res.status(403).json({ ok: false, message: 'Solo los administradores del grupo pueden remover miembros.' });
    }

    const memberIsAdmin = Array.isArray(channelData.admins) && channelData.admins.includes(memberUid);
    const remainingAdmins = Array.isArray(channelData.admins)
      ? channelData.admins.filter((uid) => uid !== memberUid)
      : [];

    if (memberIsAdmin && remainingAdmins.length === 0) {
      return res.status(400).json({ ok: false, message: 'Debes dejar al menos un administrador en el grupo.' });
    }

    if (!channelData.members.includes(memberUid)) {
      return res.status(400).json({ ok: false, message: 'El usuario no es miembro de este grupo.' });
    }

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, message: 'Stream API key/secret no configurados.' });
    }

    const serverClient = new StreamChat(apiKey, apiSecret);
    const channel = serverClient.channel('messaging', channelId);

    await channel.removeMembers([memberUid]);

    const updatedMembers = channelData.members.filter((uid) => uid !== memberUid);
    const updatedAdmins = (channelData.admins || []).filter((uid) => uid !== memberUid);

    await adminDb.collection('streamChannels').doc(channelId).update({
      members: updatedMembers,
      admins: updatedAdmins,
    });

    return res.json({ ok: true, message: 'Miembro removido del grupo correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible remover al miembro.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Busco canales de StreamChat donde el usuario es miembro o cuyo channelId coincide, 
// para que el admin pueda observar su contenido.
app.post('/api/stream/admin/search-chats', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorizacion.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    await assertAdminRequest(adminDb, requesterUid)

    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ ok: false, message: 'Se requiere id en el cuerpo.' });
    }


    if (String(id).startsWith('group-') || String(id).startsWith('dm-')) {
      const channelDoc = await adminDb.collection('streamChannels').doc(id).get();
      if (!channelDoc.exists) {
        return res.json({ ok: true, channels: [] });
      }
      return res.json({ ok: true, channels: [{ id: channelDoc.id, ...channelDoc.data() }] });
    }

    //Busco canales donde el ID aparezca como miembro.
    const collectionRef = adminDb.collection('streamChannels');
    const snapshots = await collectionRef.where('members', 'array-contains', id).get();
    const channels = [];

    snapshots.forEach((docSnap) => {
      channels.push({ id: docSnap.id, ...docSnap.data() });
    });

    return res.json({ ok: true, channels });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error buscando chats.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Obtengo detalles de un canal de StreamChat y sus ultimos mensajes.
app.get('/api/stream/admin/channel/:channelId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorizacion.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    await assertAdminRequest(adminDb, requesterUid)

    const { channelId } = req.params;
    if (!channelId) {
      return res.status(400).json({ ok: false, message: 'channelId es obligatorio.' });
    }

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, message: 'Stream API key/secret no configurados.' });
    }

    const serverClient = new StreamChat(apiKey, apiSecret);
    const channel = serverClient.channel('messaging', channelId);

    //Recupero los ultimos 50 mensajes.
    let messages = [];
    try {
      const queryResult = await channel.query({ messages: { limit: 50 } });
      messages = queryResult.messages || [];
    } catch (err) {
      messages = [];
    }

    const channelDoc = await adminDb.collection('streamChannels').doc(channelId).get();
    const channelData = channelDoc.exists ? channelDoc.data() : null;

    return res.json({ ok: true, channel: { id: channelId, data: channelData }, messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible obtener detalles del canal.';
    return res.status(500).json({ ok: false, message });
  }
});

//Endpoint: Obtengo detalles de un canal de StreamChat y sus ultimos mensajes, 
// para que el admin pueda observar su contenido. Y si considera correcto, eliminarlo.
app.post('/api/stream/admin/channel/:channelId/delete', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorizacion.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    await assertAdminRequest(adminDb, requesterUid)

    const { channelId } = req.params;
    if (!channelId) {
      return res.status(400).json({ ok: false, message: 'channelId es obligatorio.' });
    }

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, message: 'Stream API key/secret no configurados.' });
    }

    const serverClient = new StreamChat(apiKey, apiSecret);
    const channel = serverClient.channel('messaging', channelId);

    try {
      await channel.delete();
    } catch (err) {
      console.error('Advertencia: No se pudo eliminar canal en StreamChat:', err?.message || err);
    }

    try {
      await adminDb.collection('streamChannels').doc(channelId).delete();
    } catch (err) {
      console.error('Advertencia: No se pudo eliminar documento de streamChannels:', err?.message || err);
    }

    return res.json({ ok: true, message: 'Grupo eliminado (si existia).' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible eliminar el canal.';
    return res.status(500).json({ ok: false, message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor backend en http://localhost:${PORT}`);
});
