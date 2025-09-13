// netlify/functions/scan-image.js

const vision = require('@google-cloud/vision');

exports.handler = async function(event) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // This securely initializes the client using environment variables
        // You will set these in the Netlify dashboard, NOT here.
        const client = new vision.ImageAnnotatorClient({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }
        });

        const { image } = JSON.parse(event.body);

        // Ask Google to find all text in the image
        const [result] = await client.textDetection(image);

        return {
            statusCode: 200,
            body: JSON.stringify(result),
        };

    } catch (error) {
        console.error('Google Vision API Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Google Vision API request failed.' }),
        };
    }
};