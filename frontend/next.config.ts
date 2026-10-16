import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solo en desarrollo: permite probar la app desde el celular en la misma wifi
  // (http://<ip-de-la-pc>:<puerto>). Sin esto, Next bloquea sus recursos de desarrollo
  // y la página carga sin JavaScript. Si cambia la IP de la PC, actualizarla acá.
  allowedDevOrigins: ["192.168.1.185"],
};

export default nextConfig;
