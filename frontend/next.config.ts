import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Solo en desarrollo: permite probar la app desde el celular en la misma wifi
// (http://<ip-de-la-pc>:<puerto>). Sin esto, Next bloquea sus recursos de desarrollo y la página
// carga sin JavaScript (el login no hace nada y no avisa). Se toman las IP actuales de la PC, así
// no hay que tocar nada si cambia la IP (hay que reiniciar el servidor de desarrollo).
const ipsLocales = Object.values(networkInterfaces())
  .flat()
  .filter(i => i && i.family === "IPv4" && !i.internal)
  .map(i => i!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: ipsLocales,
};

export default nextConfig;
