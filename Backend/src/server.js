const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
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

async function deleteDocsInCollection(collectionRef) {
  const snapshots = await collectionRef.get();

  for (const docSnapshot of snapshots.docs) {
    await docSnapshot.ref.delete();
  }

  return snapshots.size;
}

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

async function deleteMatchingNotifications(adminDb, predicate) {
  const notificationsRef = adminDb.collection('notificaciones');
  return deleteDocsByPredicate(notificationsRef, (docSnapshot) => predicate(docSnapshot.data() || {}));
}

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
    console.error('Warning: no se pudo eliminar canal en Stream:', error?.message || error);
  }

  try {
    await adminDb.collection('streamChannels').doc(channelId).delete();
  } catch (error) {
    console.error('Warning: no se pudo eliminar streamChannels doc:', error?.message || error);
  }

  return true;
}

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
      console.error('Warning: no se pudo eliminar lista temática en cascada:', error?.message || error);
    }
  }

  return ownedListIds.size;
}

async function deleteUserDataWithFullCleanup(adminDb, uid) {
  const referenceFields = getReferenceFields();
  const summary = {
    usuario: 0,
    rootMatches: 0,
    notifications: 0,
    reportes: 0,
    activities: 0,
    streamChannels: 0,
    comments: 0,
    likes: 0,
    thematicLists: 0,
  };

  summary.thematicLists = await deleteUserOwnedThematicLists(adminDb, uid);

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

async function deleteComicCascade(adminDb, comicId) {
  if (!comicId) {
    throw new Error('comicId es obligatorio.');
  }

  const comicRef = adminDb.collection('comics').doc(comicId);
  const comicSnapshot = await comicRef.get();

  if (!comicSnapshot.exists) {
    throw new Error('No se encontró el comic.');
  }

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

  const volumeSnapshots = await adminDb.collectionGroup('tomos').get();

  for (const volumeSnapshot of volumeSnapshots.docs) {
    const parentComicRef = volumeSnapshot.ref.parent.parent;
    const parentCollectionName = parentComicRef?.parent?.id || '';

    if (parentCollectionName !== 'comics' || parentComicRef?.id !== comicId) {
      continue;
    }

    await volumeSnapshot.ref.delete();
  }

  await adminDb.recursiveDelete(comicRef);

  return true;
}

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

  const volumeSnapshots = await adminDb.collectionGroup('tomos').get();

  for (const snap of volumeSnapshots.docs) {
    const parentComicRef = snap.ref.parent.parent;
    const parentCollectionName = parentComicRef?.parent?.id || '';

    if (parentCollectionName !== 'comics' || parentComicRef?.id !== comicId || snap.id !== volumeId) {
      continue;
    }

    await snap.ref.delete();
  }

  await volumeRef.delete();

  return true;
}

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

async function deleteUserDataAcrossCollections(adminDb, uid) {
  const referenceFields = getReferenceFields();
  const deletedDocPaths = [];
  const deletionSummary = {};

  // 1. Eliminar el documento del usuario en la colección raíz 'usuario'
  const userProfileRef = adminDb.collection('usuario').doc(uid);
  const userProfileSnapshot = await userProfileRef.get();

  if (userProfileSnapshot.exists) {
    await adminDb.recursiveDelete(userProfileRef);
    deletedDocPaths.push(userProfileRef.path);
    deletionSummary['usuario'] = 1;
  }

  // 2. Buscar y eliminar documentos en TODAS las colecciones raíz que referencien al usuario
  const rootCollections = await adminDb.listCollections();

  for (const collectionRef of rootCollections) {
    const collectionName = collectionRef.id;
    let deletedInCollection = 0;

    // Buscar en cada campo de referencia configurado
    for (const fieldName of referenceFields) {
      try {
        const matchingDocs = await collectionRef.where(fieldName, '==', uid).get();

        for (const documentSnapshot of matchingDocs.docs) {
          const path = documentSnapshot.ref.path;

          // Evitar duplicados si el documento ya fue eliminado
          if (!deletedDocPaths.includes(path)) {
            await adminDb.recursiveDelete(documentSnapshot.ref);
            deletedDocPaths.push(path);
            deletedInCollection++;
          }
        }
      } catch (error) {
        // El campo puede no existir en esta colección, ignorar error
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
      console.error('Warning: no se pudo eliminar usuario de Auth:', error?.message || error);
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

    await deleteVolumeCascade(adminDb, req.params.comicId, req.params.volumeId);

    return res.json({ ok: true, message: 'Tomo eliminado correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible eliminar el tomo.';
    return res.status(500).json({ ok: false, message });
  }
});

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

app.delete('/api/admin/channels/:channelId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, message: 'Falta token de autorización.' });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const { adminAuth, adminDb } = getAdminServices();
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    await assertAdminRequest(adminDb, decodedToken.uid);

    await deleteGroupCascade(adminDb, req.params.channelId);

    return res.json({ ok: true, message: 'Grupo eliminado correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible eliminar el grupo.';
    return res.status(500).json({ ok: false, message });
  }
});

// Endpoint: generar token de Stream para un usuario autenticado
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

    // Upsert minimal user info to Stream (optional but helpful)
    try {
      const userRecord = await getFirestore().collection('usuario').doc(uid).get();
      const profile = userRecord.exists ? userRecord.data() : null;

      await serverClient.upsertUser({
        id: uid,
        name: profile?.nick || profile?.Nick || uid,
        image: getSafeStreamImage(profile),
      });
    } catch (err) {
      // non-fatal
      console.error('Warning: no se pudo upsertUser en Stream:', err?.message || err);
    }

    const token = serverClient.createToken(uid);

    return res.json({ ok: true, token, apiKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible crear token Stream.';
    return res.status(500).json({ ok: false, message });
  }
});

// Endpoint: crear canal en Stream con validación de amistad para 1:1
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

    // If this is a 1:1 channel (members length == 2 and distinct), validate friendship
    if (members.length === 2) {
      // ensure requester is one of members
      if (!members.includes(requesterUid)) {
        return res.status(403).json({ ok: false, message: 'No autorizado para crear este chat 1:1.' });
      }

      const otherUid = members.find((m) => m !== requesterUid);

      const friendDoc = await adminDb.collection('usuario').doc(requesterUid).collection('Amigos').doc(otherUid).get();

      if (!friendDoc.exists) {
        return res.status(403).json({ ok: false, message: 'Solo puedes crear chat 1:1 con amigos.' });
      }
    } else {
      // For group channels, validate that requester is friend with each added member
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

    // Create a distinct channel id for 1:1 to avoid duplicates
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

    // Update channel with custom data
    try {
      await channel.update(customData);
    } catch (err) {
      console.error('Warning: no se pudo actualizar datos custom del canal:', err?.message || err);
    }

    // Persist mapping in Firestore for local metadata and cascade operations
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
      console.error('Warning: no se pudo persistir streamChannels mapping:', err?.message || err);
    }

    return res.json({ ok: true, channel: { id: channelId, type: channelType, members } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible crear canal Stream.';
    return res.status(500).json({ ok: false, message });
  }
});

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

    // Fetch channel from Firestore to check if requester is admin
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

    // Update Firestore
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

    // Fetch channel from Firestore
    const channelDoc = await adminDb.collection('streamChannels').doc(channelId).get();
    if (!channelDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Canal no encontrado.' });
    }

    const channelData = channelDoc.data();
    const isAdmin = channelData.admins && channelData.admins.includes(requesterUid);
    if (!isAdmin) {
      return res.status(403).json({ ok: false, message: 'Solo los administradores del grupo pueden agregar miembros.' });
    }

    // Validate friendship with new members
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

    // Upsert new members
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

    // Update Firestore
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

    // Fetch channel from Firestore
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

    // Update Firestore
    await adminDb.collection('streamChannels').doc(channelId).update({
      admins: currentAdmins,
    });

    return res.json({ ok: true, message: 'Usuario promovido a admin correctamente.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible promover a admin.';
    return res.status(500).json({ ok: false, message });
  }
});

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

    // Fetch channel from Firestore
    const channelDoc = await adminDb.collection('streamChannels').doc(channelId).get();
    if (!channelDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Canal no encontrado.' });
    }

    const channelData = channelDoc.data();
    if (!channelData.members.includes(requesterUid)) {
      return res.status(403).json({ ok: false, message: 'No eres miembro de este grupo.' });
    }

    const apiKey = process.env.STREAM_API_KEY;
    const apiSecret = process.env.STREAM_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ ok: false, message: 'Stream API key/secret no configurados.' });
    }

    const serverClient = new StreamChat(apiKey, apiSecret);
    const channel = serverClient.channel('messaging', channelId);

    await channel.removeMembers([requesterUid]);

    // Update Firestore
    const updatedMembers = channelData.members.filter((uid) => uid !== requesterUid);
    const updatedAdmins = (channelData.admins || []).filter((uid) => uid !== requesterUid);

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

    // Fetch channel from Firestore
    const channelDoc = await adminDb.collection('streamChannels').doc(channelId).get();
    if (!channelDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Canal no encontrado.' });
    }

    const channelData = channelDoc.data();
    const isAdmin = channelData.admins && channelData.admins.includes(requesterUid);
    if (!isAdmin) {
      return res.status(403).json({ ok: false, message: 'Solo los administradores del grupo pueden remover miembros.' });
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

    // Update Firestore
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

// Admin: buscar chats por userId o channelId (sin sumarse como miembro)
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

    // verificar rol de admin en Firestore
    await assertAdminRequest(adminDb, requesterUid)

    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ ok: false, message: 'Se requiere id en el cuerpo.' });
    }

    // Si parece un channelId explícito, intentar cargar ese canal
    if (String(id).startsWith('group-') || String(id).startsWith('dm-')) {
      const channelDoc = await adminDb.collection('streamChannels').doc(id).get();
      if (!channelDoc.exists) {
        return res.json({ ok: true, channels: [] });
      }
      return res.json({ ok: true, channels: [{ id: channelDoc.id, ...channelDoc.data() }] });
    }

    // Buscar canales donde el id aparezca como miembro
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

// Admin: obtener detalles de un canal y mensajes recientes para observacion (solo lectura)
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

    // Intenta recuperar los ultimos mensajes
    let messages = [];
    try {
      const queryResult = await channel.query({ messages: { limit: 50 } });
      messages = queryResult.messages || [];
    } catch (err) {
      // non fatal
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

// Admin: eliminar un grupo de chat
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
      // continue even if stream deletion fails
      console.error('Warning: no se pudo eliminar canal en Stream:', err?.message || err);
    }

    // eliminar mapping en Firestore
    try {
      await adminDb.collection('streamChannels').doc(channelId).delete();
    } catch (err) {
      console.error('Warning: no se pudo eliminar streamChannels doc:', err?.message || err);
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
