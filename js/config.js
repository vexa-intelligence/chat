const CONFIG = {
    BASE: 'https://vexa-ai.pages.dev',
    FIREBASE_CONFIG: {
        apiKey: window.ENV_FIREBASE_API_KEY,
        authDomain: window.ENV_FIREBASE_AUTH_DOMAIN,
        projectId: window.ENV_FIREBASE_PROJECT_ID,
        storageBucket: window.ENV_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: window.ENV_FIREBASE_MESSAGING_SENDER_ID,
        appId: window.ENV_FIREBASE_APP_ID,
        measurementId: window.ENV_FIREBASE_MEASUREMENT_ID
    },
    CLOUDINARY_CONFIG: {
        cloudName: window.ENV_CLOUDINARY_CLOUD_NAME,
        uploadPreset: window.ENV_CLOUDINARY_UPLOAD_PRESET,
        apiKey: window.ENV_CLOUDINARY_API_KEY
    }
};