# 🚀 DeployOS — Plataforma de Hosting tipo Vercel

Plataforma completa de hosting con gestión de sitios, GitHub, dominios personalizados y panel de admin.

---

## ⚙️ Configuración de Firebase (OBLIGATORIO)

1. Ve a https://console.firebase.google.com
2. Crea un proyecto nuevo (o usa uno existente)
3. Activa **Authentication** → Email/Password
4. Activa **Firestore Database** (modo producción)
5. Ve a Configuración del proyecto → Tus apps → Agrega app Web
6. Copia las credenciales y pégalas en `app.js`:

```js
const FIREBASE_CONFIG = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};
```

---

## 👤 Admin

El único administrador es: `troopermaskyt@gmail.com`

Al iniciar sesión con ese correo, se desbloquea automáticamente el panel **⚡ Admin** con:
- Lista de todos los usuarios
- Todos los sitios desplegados
- Estadísticas globales
- Toggles de configuración de plataforma

---

## 💰 Política de Dominios

- **Primer dominio personalizado**: GRATIS ✅
- **Dominios adicionales**: $10/mes cada uno 💳
- **Subdominio `.deployos.app`**: siempre gratis

---

## 🌐 Cómo desplegar

### Opción 1 — Abrir directamente
Abre `index.html` en tu navegador. (Requiere Firebase configurado para auth real).

### Opción 2 — Servidor local
```bash
npx serve .
# o
python3 -m http.server 8080
```

### Opción 3 — Subir a Vercel / Netlify
Arrastra la carpeta al dashboard de Vercel o Netlify. ¡Listo!

---

## 📁 Estructura

```
deployos/
├── index.html    ← Toda la UI (HTML + CSS)
├── app.js        ← Toda la lógica (JS + Firebase)
└── README.md     ← Esta guía
```

---

## 🔒 Seguridad (Firestore Rules recomendadas)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /sites/{siteId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

Hecho con ❤️ para TrooperMaskyt
