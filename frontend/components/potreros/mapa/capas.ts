// Capas de imagen para el mapa de potreros (mosaicos en la proyección web, EPSG:3857).
//
// Licencias (ver contexto/DISENO-POTREROS.md): confirmar antes de un uso comercial.
//  - Esri World Imagery: necesita una clave de ArcGIS Location Platform en NEXT_PUBLIC_ESRI_API_KEY
//    (restringida por dominio en el panel de Esri). Exige atribución; no se guardan ni redistribuyen mosaicos.
//  - IDE Uruguay: Mapa Base (rutas, caminos, vía férrea, arroyos y localidades), publicado como datos
//    abiertos, sin clave. (La ortofoto 2017-2018 de la IDE se sacó a pedido de Iñaki.)

export type IdCapa = "esri" | "ide_mapa"

export interface Capa {
  id: IdCapa
  nombre: string
  url: string
  atribucion: string
  maxNativeZoom: number
}

const CLAVE_ESRI = process.env.NEXT_PUBLIC_ESRI_API_KEY ?? ""

// WMTS del Mapa Base de la IDE (pedido por parámetros), con la grilla EPSG:3857
const MAPA_BASE_IDE =
  "https://mapas.ide.uy/geoserver-vectorial/gwc/service/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
  "&LAYER=capa_base_ideuy_ideuy&STYLE=&TILEMATRIXSET=EPSG:3857&TILEMATRIX=EPSG:3857:{z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png"

const IDE = '<a href="https://www.gub.uy/infraestructura-datos-espaciales" target="_blank" rel="noopener">IDE Uruguay</a>'

export const CAPAS: Capa[] = [
  ...(CLAVE_ESRI
    ? [{
        id: "esri" as const,
        nombre: "Satélite (Esri)",
        url: `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(CLAVE_ESRI)}`,
        atribucion: 'Imagen: <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics y la comunidad de usuarios de SIG',
        maxNativeZoom: 19,
      }]
    : []),
  { id: "ide_mapa", nombre: "Mapa con rutas y caminos (IDE)", url: MAPA_BASE_IDE, atribucion: `Mapa Base © ${IDE}`, maxNativeZoom: 20 },
]

// Por defecto: el satelital de Esri si hay clave; si no, el mapa de rutas de la IDE
export const CAPA_POR_DEFECTO: IdCapa = CAPAS[0].id
