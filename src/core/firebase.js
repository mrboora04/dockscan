import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
const app = initializeApp(window.FB_CONFIG);
const auth = getAuth(app);
await signInAnonymously(auth);
export { app, auth };
