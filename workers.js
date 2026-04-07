export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === '/env.js') {
            const js = `
window.ENV_FIREBASE_API_KEY = ${JSON.stringify(env.FIREBASE_API_KEY || '')};
window.ENV_FIREBASE_AUTH_DOMAIN = ${JSON.stringify(env.FIREBASE_AUTH_DOMAIN || '')};
window.ENV_FIREBASE_PROJECT_ID = ${JSON.stringify(env.FIREBASE_PROJECT_ID || '')};
window.ENV_FIREBASE_STORAGE_BUCKET = ${JSON.stringify(env.FIREBASE_STORAGE_BUCKET || '')};
window.ENV_FIREBASE_MESSAGING_SENDER_ID = ${JSON.stringify(env.FIREBASE_MESSAGING_SENDER_ID || '')};
window.ENV_FIREBASE_APP_ID = ${JSON.stringify(env.FIREBASE_APP_ID || '')};
window.ENV_FIREBASE_MEASUREMENT_ID = ${JSON.stringify(env.FIREBASE_MEASUREMENT_ID || '')};

window.ENV_CLOUDINARY_CLOUD_NAME = ${JSON.stringify(env.CLOUDINARY_CLOUD_NAME || '')};
window.ENV_CLOUDINARY_UPLOAD_PRESET = ${JSON.stringify(env.CLOUDINARY_UPLOAD_PRESET || 'unsigned')};
window.ENV_CLOUDINARY_API_KEY = ${JSON.stringify(env.CLOUDINARY_API_KEY || '')};
`.trim();
            return new Response(js, {
                headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' },
            });
        }

        return fetch(request);
    },
};