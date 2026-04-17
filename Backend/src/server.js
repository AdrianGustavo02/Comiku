const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function getReferenceFields() {
  const configuredFields = process.env.USER_REFERENCE_FIELDS;

  if (!configuredFields) {
    return ['UID', 'uid', 'userId', 'ownerUid'];
  }

  return configuredFields
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
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

async function deleteUserDataAcrossCollections(adminDb, uid) {
  const referenceFields = getReferenceFields();
  const deletedDocPaths = new Set();

  const userProfileRef = adminDb.collection('usuario').doc(uid);
  const userProfileSnapshot = await userProfileRef.get();

  if (userProfileSnapshot.exists) {
    await adminDb.recursiveDelete(userProfileRef);
    deletedDocPaths.add(userProfileRef.path);
  }

  const rootCollections = await adminDb.listCollections();

  for (const collectionRef of rootCollections) {
    for (const fieldName of referenceFields) {
      const matchingDocs = await collectionRef.where(fieldName, '==', uid).get();

      for (const documentSnapshot of matchingDocs.docs) {
        const path = documentSnapshot.ref.path;

        if (deletedDocPaths.has(path)) {
          continue;
        }

        await adminDb.recursiveDelete(documentSnapshot.ref);
        deletedDocPaths.add(path);
      }
    }
  }

  return {
    deletedDocuments: deletedDocPaths.size,
    referenceFields,
  };
}

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

    const deletionSummary = await deleteUserDataAcrossCollections(adminDb, uid);
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

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Backend funcionando correctamente',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
