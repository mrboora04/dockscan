import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

// This version now correctly reads the configuration from the global window object.
const app = initializeApp(window.FB_CONFIG);
const auth = getAuth(app);

export { app, auth };