import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDwUYRjUe7wKHp64d1vfYV-UDvnXaUuQVY",
  authDomain: "reflectioncapturedthoughts.firebaseapp.com",
  projectId: "reflectioncapturedthoughts",
  storageBucket: "reflectioncapturedthoughts.firebasestorage.app",
  messagingSenderId: "331335730832",
  appId: "1:331335730832:web:731df65bd40f9646adfa15",
  measurementId: "G-7NXNZDNDRE"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
