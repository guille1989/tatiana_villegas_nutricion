# Wizard de planes de nutrición (Fullstack)

Frontend React + Vite + MUI y backend Node/Express + MongoDB (Mongoose). Calcula calorías/macros y permite crear planes con overrides diarios.

## Requisitos
- Node 18+
- MongoDB accesible (MONGO_URI)

## Backend
```bash
cd server
cp .env.example .env   # ajusta MONGO_URI, PORT, CLIENT_URL
npm install
npm run dev
```
La API expone `/api/*` (puerto por defecto 4000).

## Frontend (este repo)
```bash
cp .env.example .env   # en la raíz del repo con VITE_API_URL
npm install
npm install
npm run dev
```
Abre http://localhost:5173 (o el puerto que indique Vite).

## Notas
- El wizard guarda la evaluación vía API. Usa la misma para crear planes y editar overrides diarios.
- Validaciones de request con Zod y cálculo en el servidor.
- CORS permite el dominio configurado en `CLIENT_URL`.
