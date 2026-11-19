/* Sunum oylaması: Uwufufu ile aynı Firebase projesi ve aynı veri biçimi
   (uwufufu/{kod}, oylar/{uid}); kartlar [1, 2] = Kayıt A, Kayıt B. */
const FB = 'https://www.gstatic.com/firebasejs/12.16.0/';
let F = null;
export async function firebase() {
  if (F) return F;
  const [{ initializeApp }, { getAuth, signInAnonymously }, fs] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')
  ]);
  const app = initializeApp({
    apiKey: 'AIzaSyC1X6QrbqUaHevdPbeE_GiN34i3PBOXVq0',
    authDomain: 'derslik8-online.firebaseapp.com',
    projectId: 'derslik8-online',
    storageBucket: 'derslik8-online.firebasestorage.app',
    messagingSenderId: '691814192695',
    appId: '1:691814192695:web:070dc72b80a191634dd1b2'
  });
  const auth = getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  F = { uid: auth.currentUser.uid, db: fs.getFirestore(app), ...fs };
  return F;
}
export const oturum = (kod) => F.doc(F.db, 'uwufufu', kod);
export const oylar = (kod) => F.collection(F.db, 'uwufufu', kod, 'oylar');
export const oy = (kod, uid) => F.doc(F.db, 'uwufufu', kod, 'oylar', uid);
