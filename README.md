![Vexa Chat](https://vexa-ai.pages.dev/images/banner.png)

# Vexa

Modern AI chat application with image generation, multi-model support, and real-time features.

Features
	•	AI chat interface with streaming responses
	•	Image generation with style presets
	•	Image upload + analysis
	•	Chat history with search
	•	Multi-model support + model picker
	•	Authentication (email/password)
	•	Cloud storage for images
	•	Personalization (tone, behavior, instructions)
	•	AI theme generation
	•	Web search and deep research modes
	•	Export chats (JSON)
	•	Responsive UI (mobile + desktop)

Tech Stack
	•	Frontend: HTML, CSS, JavaScript
	•	Auth/Database/Storage: Firebase
	•	Image storage & upload: Cloudinary
	•	Syntax highlighting: highlight.js
	•	Icons: Font Awesome

Pages
	•	/ or /new-chat — Chat interface
	•	/chat/:id — Specific chat session
	•	/images — Image generation + gallery

Core Components
	•	Chat system (chat.js)
	•	Image generation (images.js)
	•	Authentication (auth.js)
	•	Model handling (models.js)
	•	Settings system (settings.js)
	•	Search (search.js)
	•	File/image attach (attach.js)
	•	AI themes (ai-themes.js)

Key UI Systems
	•	Sidebar with chat history
	•	Topbar navigation
	•	Chat input with tools:
	•	File upload
	•	Thinking mode
	•	Web search
	•	Deep research
	•	Image generator with presets
	•	Settings modal (multi-section)
	•	Model picker overlay
	•	Search modal
	•	Mobile drawer

Settings
	•	General (send behavior, timestamps, streaming)
	•	Appearance (theme, font size, AI themes)
	•	Personalization (tone, traits, instructions)
	•	AI (model, response length, language, memory, system prompt)
	•	Data (export chats, delete data)
	•	Account management

Installation

git clone <repo>
cd vexa

Serve with any static server:

npx serve .

Environment

Configured via /js/env.js.

Required services:
	•	Firebase project (Auth, Firestore, Storage)
	•	Cloudinary account

PWA Support
	•	Manifest included
	•	Apple touch icons configured
	•	Mobile installable

Notes
	•	Requires valid Firebase config
	•	Image upload uses Cloudinary widget
	•	Chat sessions stored in Firestore
	•	UI is fully client-side

License

MIT
