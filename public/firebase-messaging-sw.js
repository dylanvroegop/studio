/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.3/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCL2Mh-J4VSd_9lhiUVuizAx3GRjPTMINU',
  authDomain: 'studio-6011690104-60fbf.firebaseapp.com',
  projectId: 'studio-6011690104-60fbf',
  storageBucket: 'studio-6011690104-60fbf.firebasestorage.app',
  messagingSenderId: '354400474758',
  appId: '1:354400474758:web:ec97d6463a627fc7ad2307',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Planning reminder';
  const options = {
    body: payload.notification?.body || 'Je planning heeft een update.',
    icon: '/icon-192.png',
    badge: '/favicon-32.png',
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/planning'));
});
