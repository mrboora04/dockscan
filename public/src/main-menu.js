import { auth } from './core/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const userEmailElement = document.getElementById('userEmail');

onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in
    userEmailElement.textContent = `Logged in as: ${user.email}`;
  } else {
    // User is signed out, redirect to login page
    window.location.href = '/login.html';
  }
});