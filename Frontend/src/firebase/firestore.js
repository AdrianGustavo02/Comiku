import { collection, getDocs, limit, query } from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'

const FIRESTORE_COLLECTION = 'comiku_status'

export async function checkFirestoreConnection() {
  if (!isFirebaseConfigured || !db) {
    throw new Error(
      'Falta configurar Firebase. Revisa tus variables VITE_FIREBASE_*.',
    )
  }

  const snapshot = await getDocs(
    query(collection(db, FIRESTORE_COLLECTION), limit(1)),
  )

  return {
    collection: FIRESTORE_COLLECTION,
    documents: snapshot.size,
  }
}