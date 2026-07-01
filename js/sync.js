// Необязательный слой синхронизации списка между устройствами через Firebase.
// Пока js/firebase-config.js содержит FIREBASE_CONFIG = null — модуль ничего
// не делает, всё работает только через localStorage (см. app.js).
(function () {
  const CDN = 'https://www.gstatic.com/firebasejs/10.12.2/';
  let db = null;
  let unsubscribe = null;
  let onRemoteUpdate = null;
  let lastPushedJSON = null;

  function isConfigured() {
    return !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Не удалось загрузить ' + src));
      document.head.appendChild(s);
    });
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function ensureFirebaseLoaded() {
    if (window.firebase && window.firebase.apps) return;
    await loadScript(CDN + 'firebase-app-compat.js');
    await loadScript(CDN + 'firebase-auth-compat.js');
    await loadScript(CDN + 'firebase-firestore-compat.js');
  }

  // passcode -> подключается к общему для этого кода документу в Firestore.
  // onUpdate(shortlistArray) вызывается при изменениях с других устройств.
  async function connect(passcode, onUpdate) {
    if (!isConfigured()) {
      throw new Error('Firebase не настроен: заполни js/firebase-config.js (см. README).');
    }
    if (!passcode || !passcode.trim()) {
      throw new Error('Нужен код доступа.');
    }
    onRemoteUpdate = onUpdate;

    await ensureFirebaseLoaded();
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(window.FIREBASE_CONFIG);
    }
    await window.firebase.auth().signInAnonymously();
    db = window.firebase.firestore();

    const docId = await sha256Hex('postuplenie:' + passcode.trim());
    const ref = db.collection('lists').doc(docId);

    if (unsubscribe) unsubscribe();
    unsubscribe = ref.onSnapshot(snap => {
      if (!snap.exists) return;
      const data = snap.data();
      const json = JSON.stringify(data.shortlist || []);
      if (json === lastPushedJSON) return; // это наше же изменение, эхо игнорируем
      onRemoteUpdate(data.shortlist || []);
    });

    return { docId, ref };
  }

  async function push(ref, shortlistArray) {
    if (!ref) return;
    lastPushedJSON = JSON.stringify(shortlistArray);
    await ref.set({ shortlist: shortlistArray, updatedAt: Date.now() }, { merge: true });
  }

  function disconnect() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    db = null;
  }

  window.SYNC = { isConfigured, connect, push, disconnect };
})();
