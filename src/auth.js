import { app, auth } from './core/firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword ,
     updateProfile
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const nameGroup = document.getElementById('name-group');
const displayNameInput = document.getElementById('displayName');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const btnLogin = document.getElementById('btnLogin');
const btnCreateAccount = document.getElementById('btnCreateAccount');
const errorMessage = document.getElementById('error-message');

// Function to handle successful login
function handleLoginSuccess() {
    // Redirect to the new main menu after a successful login.
    window.location.href = '/main-menu.html'; 
}
// Function to display errors
function displayError(message) {
    errorMessage.textContent = message;
}

// Event listener for the Login button
btnLogin.addEventListener('click', async () => {
    nameGroup.style.display = 'none'; 
    const email = emailInput.value;
    const password = passwordInput.value;
    displayError(''); // Clear previous errors

    if (!email || !password) {
        displayError('Please enter both email and password.');
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        handleLoginSuccess();
    } catch (error) {
        console.error('Login Error:', error);
        displayError('Login failed. Please check your credentials.');
    }
});

// Event listener for the Create Account button
btnCreateAccount.addEventListener('click', async () => {
    nameGroup.style.display = 'block'; 
    const displayName = displayNameInput.value;
    const email = emailInput.value;
    const password = passwordInput.value;
    displayError(''); // Clear previous errors

// Add display name to the validation check
    if (!email || !password || !displayName) { 
        displayError('Please fill out all fields to create an account.');
        return;
    }
    
    try {
        // Create the user with email and password
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Add the display name to the new user's profile
        await updateProfile(userCredential.user, {
            displayName: displayName
        });

        handleLoginSuccess();
    } catch (error) {
        console.error('Account Creation Error:', error);
        if (error.code === 'auth/email-already-in-use') {
            displayError('This email is already in use.');
        } else {
            displayError('Account creation failed.');
        }
    }
});