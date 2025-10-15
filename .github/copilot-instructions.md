# GitHub Copilot Instructions for DockScan

## Project Overview
DockScan is a web-based document scanning application that uses device cameras to scan, process, and manage documents. The application includes OCR (Optical Character Recognition), barcode scanning, and image processing capabilities.

## Technology Stack
- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend/Services**: Firebase (Authentication, Hosting)
- **APIs**: Firebase Auth, Google Cloud Vision API (for OCR/image processing)
- **Build System**: None (direct browser-compatible JavaScript)

## Code Style and Conventions

### JavaScript
- Use ES6+ features (modules, arrow functions, async/await, destructuring)
- Use `const` and `let` instead of `var`
- Prefer template literals for string concatenation
- Use meaningful variable and function names
- Add comments for complex logic, especially in vision processing
- Handle errors gracefully with try-catch blocks
- Use async/await for asynchronous operations

### HTML
- Use semantic HTML5 elements
- Include proper meta tags for mobile viewport
- Keep structure clean and accessible
- Use `id` for unique elements and `class` for styling

### CSS
- Follow existing naming conventions in `styles.css`
- Use BEM-like naming for component-specific styles
- Maintain responsive design principles
- Keep mobile-first approach for viewport settings

## Module Structure
- **`/src/auth.js`**: Firebase authentication logic
- **`/src/core/`**: Core Firebase and configuration
- **`/src/vision/`**: Computer vision and image processing
- **`/src/ui/`**: UI-related JavaScript modules
- **`/public/`**: Static assets and service worker

## Important Guidelines

### Firebase Integration
- Always import from the correct Firebase module paths
- Use the existing Firebase app instance from `/src/core/firebase.js`
- Handle authentication state changes properly
- Never commit Firebase configuration secrets

### Camera and Vision Features
- Always request camera permissions before accessing
- Handle camera errors gracefully (permission denied, no camera, etc.)
- Optimize image processing for performance
- Clean up camera resources when done

### Error Handling
- Display user-friendly error messages
- Log technical errors to console for debugging
- Always validate user input
- Handle network failures gracefully

### Security
- Never expose API keys or sensitive configuration
- Validate and sanitize user input
- Use Firebase security rules appropriately
- Follow authentication best practices

## Testing
- Test on multiple browsers (Chrome, Firefox, Safari, Edge)
- Test on mobile devices for camera functionality
- Verify camera permissions handling
- Test offline behavior with service worker

## Common Patterns

### Module Import Pattern
```javascript
import { functionName } from './path/to/module.js';
import { auth, app } from './core/firebase.js';
```

### Firebase Auth Pattern
```javascript
signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
        // Handle success
    })
    .catch((error) => {
        // Handle error
        displayError(error.message);
    });
```

### Camera Access Pattern
```javascript
const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
});
videoElement.srcObject = stream;
```

## File Naming
- Use kebab-case for HTML and CSS files: `main-menu.html`
- Use kebab-case for JavaScript files: `scanner-logic.js`
- Keep names descriptive and concise

## Performance Considerations
- Minimize DOM manipulations
- Use requestAnimationFrame for animations
- Debounce camera frame processing
- Lazy load modules when possible
- Optimize image sizes before processing

## Accessibility
- Provide alternative text for images
- Ensure keyboard navigation works
- Use ARIA labels where appropriate
- Maintain sufficient color contrast

## When Making Changes
- Keep changes minimal and focused
- Test camera functionality after modifications
- Verify Firebase integration still works
- Check responsive design on mobile
- Ensure no console errors appear
- Update comments if logic changes significantly
