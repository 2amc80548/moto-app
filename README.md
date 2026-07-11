# MotoCab - Sistema de Transporte Local 🏍️

Este proyecto es una aplicación de reserva y gestión de viajes en motocicleta en tiempo real, desarrollada con **Vue 3 (Vite)** en el frontend y utilizando **Firebase** (Authentication, Firestore, Realtime Database) junto con **Mapbox GL JS** para el mapeo y posicionamiento GPS.

---

## 📌 Requisitos Previos

Antes de ejecutar la aplicación, debes tener instalado en tu computadora:

1. **Node.js:** Versión 16.x o superior (Recomendado LTS v18 o v20). Puedes descargarlo desde [nodejs.org](https://nodejs.org/).
2. **NPM:** Gestor de paquetes que se instala automáticamente junto con Node.js.
3. **Una cuenta en Mapbox:** Necesitas obtener un token de acceso público gratuito de [mapbox.com](https://www.mapbox.com/) para poder renderizar los mapas.
4. **Un proyecto en Firebase:** Necesitas configurar una cuenta y proyecto gratuito en [console.firebase.google.com](https://console.firebase.google.com/).

---

## 🚀 Instalación y Configuración Local

Sigue estos pasos para poner a correr la aplicación en tu entorno de desarrollo local:

### 1. Descargar dependencias
Abre tu terminal en la raíz del proyecto y ejecuta:
```bash
npm install
```

### 2. Configurar variables de entorno
1. En la raíz del proyecto, duplica el archivo `.env.example` y renómbralo como `.env`:
   ```bash
   cp .env.example .env
   ```
2. Abre el archivo `.env` y añade tu token de Mapbox en la línea:
   ```env
   VITE_MAPBOX_TOKEN=tu_token_de_mapbox_aqui
   ```

### 3. Configurar Firebase (¿Qué es automático y qué manual?)

No necesitas crear bases de datos ni tablas manualmente desde cero, pero sí debes activar los servicios en la consola de Firebase. Sigue esta guía:

#### A. En la Consola de Firebase:
1. **Crear Proyecto:** Crea un nuevo proyecto en [Firebase Console](https://console.firebase.google.com/).
2. **Crear una App Web:** En la vista general del proyecto, haz clic en el botón de **Web (</>)** para registrar tu aplicación. Copia las credenciales (objeto `firebaseConfig`).
3. **Activar Authentication:**
   * Ve a la sección **Authentication** -> **Get Started**.
   * Habilita el método de inicio de sesión **Correo electrónico/Contraseña** (Email/Password). *(Nota: El inicio de sesión con Google y la verificación de correo electrónico están desactivados/omitidos para facilitar las pruebas locales).*
4. **Activar Cloud Firestore (Base de Datos NoSQL):**
   * Ve a **Firestore Database** -> **Create database**.
   * Elige la ubicación de tu base de datos y comienza en **Modo de Prueba** (Test Mode) para que no tengas problemas de permisos al leer/escribir localmente.
   * *¿Debo crear colecciones?* **No**. Las colecciones (`users`, `rides`) se crearán **automáticamente** cuando el primer cliente se registre y la primera carrera sea solicitada.
5. **Activar Realtime Database (Ubicaciones GPS en vivo):**
   * Ve a **Realtime Database** -> **Create database**.
   * Inicia también en **Modo de Prueba**.
   * *¿Debo crear nodos?* **No**. Los nodos de localización en vivo (`drivers_online`) se configuran y crean automáticamente en tiempo real cuando un conductor se conecta en línea.

#### B. Enlazar Firebase con el código:
Tienes dos opciones para colocar tus claves de Firebase:

* **(Recomendada):** Pega tus claves directamente en las variables `VITE_FIREBASE_*` en el archivo `.env` que creaste en el paso anterior.

---

## 💻 Ejecución en Desarrollo

Para arrancar el servidor local de Vite, corre el siguiente comando en la raíz del proyecto:
```bash
npm run dev
```

La consola te indicará el enlace local (por defecto [http://localhost:5173/](http://localhost:5173/)). Ábrelo en tu navegador.

---

## 🛠️ Roles de Usuario y Flujo de Prueba

Para probar el flujo completo en local, te recomendamos abrir **tres pestañas o navegadores diferentes** (o pestañas de incógnito):

1. **El Administrador:**
   * Crea una cuenta desde la pantalla de registro de la app.
   * Ve a tu consola de Firebase Firestore, busca el documento creado en la colección `users` para esa cuenta, y cambia manualmente su campo `role` a `"admin"`.
   * Al iniciar sesión con esa cuenta, entrarás directamente al Panel de Control de Administrador.
2. **El Conductor (Chofer):**
   * Registra un chofer subiendo su foto (o tomándola con la cámara/webcam) y rellenando los datos del vehículo.
   * Por seguridad, los choferes inician en estado no aprobado.
   * Ve a la pestaña del **Administrador** y habilita/aprueba al chofer recién registrado.
   * En la pestaña del chofer, haz clic en **Conectarse** para simular que está en línea y actualizar su ubicación GPS.
3. **El Cliente:**
   * Registra una cuenta de cliente e inicia sesión.
   * Marca tus ubicaciones (Punto A y Punto B) en el mapa.
   * Define el tipo de servicio (Viaje, Envío o Pedido), ajusta tu tarifa sugerida o extra en Bs, y dale a **Confirmar y Buscar**.
   * El sistema asignará por cercanía el viaje al chofer en línea, quien recibirá una notificación con la tarifa desglosada y tendrá un temporizador de aceptación.
