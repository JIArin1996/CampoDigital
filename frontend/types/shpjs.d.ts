// shpjs no trae tipos: lee un shapefile en zip (con su .prj) y lo devuelve en GeoJSON, en grados
declare module "shpjs" {
  type Coleccion = GeoJSON.FeatureCollection & { fileName?: string }
  export default function shp(entrada: ArrayBuffer | string): Promise<Coleccion | Coleccion[]>
}
