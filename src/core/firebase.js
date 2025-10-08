import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { FB_CONFIG } from '../../public/config.js';

const app = initializeApp(FB_CONFIG);
const auth = getAuth(app);

export { app, auth };