export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      act_compraventa: {
        Row: {
          actividad_id: string
          contraparte: string | null
          created_at: string
          created_by: string | null
          establecimiento_id: string
          kg_gancho: number | null
          modalidad: string
        }
        Insert: {
          actividad_id: string
          contraparte?: string | null
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          kg_gancho?: number | null
          modalidad: string
        }
        Update: {
          actividad_id?: string
          contraparte?: string | null
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          kg_gancho?: number | null
          modalidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "act_compraventa_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_compraventa_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_compraventa_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_compraventa_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      act_diagnostico: {
        Row: {
          actividad_id: string
          created_at: string
          created_by: string | null
          establecimiento_id: string
          vacas_diagnosticadas: number
          vacas_prenadas: number
        }
        Insert: {
          actividad_id: string
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          vacas_diagnosticadas: number
          vacas_prenadas: number
        }
        Update: {
          actividad_id?: string
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          vacas_diagnosticadas?: number
          vacas_prenadas?: number
        }
        Relationships: [
          {
            foreignKeyName: "act_diagnostico_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_diagnostico_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_diagnostico_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_diagnostico_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      act_esquila: {
        Row: {
          actividad_id: string
          created_at: string
          created_by: string | null
          establecimiento_id: string
          kg_lana_total: number
        }
        Insert: {
          actividad_id: string
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          kg_lana_total: number
        }
        Update: {
          actividad_id?: string
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          kg_lana_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "act_esquila_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_esquila_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_esquila_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_esquila_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      act_mortandad: {
        Row: {
          actividad_id: string
          causa: string
          created_at: string
          created_by: string | null
          establecimiento_id: string
          observaciones: string | null
        }
        Insert: {
          actividad_id: string
          causa?: string
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          observaciones?: string | null
        }
        Update: {
          actividad_id?: string
          causa?: string
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          observaciones?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "act_mortandad_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_mortandad_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_mortandad_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_mortandad_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      act_paricion: {
        Row: {
          actividad_id: string
          created_at: string
          created_by: string | null
          establecimiento_id: string
          lote_cria_id: string
          nacidos_muertos: number
        }
        Insert: {
          actividad_id: string
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          lote_cria_id: string
          nacidos_muertos?: number
        }
        Update: {
          actividad_id?: string
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          lote_cria_id?: string
          nacidos_muertos?: number
        }
        Relationships: [
          {
            foreignKeyName: "act_paricion_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_paricion_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_paricion_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_paricion_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "act_paricion_lote_cria_id_establecimiento_id_fkey"
            columns: ["lote_cria_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      act_personalizada: {
        Row: {
          actividad_id: string
          campos: Json
          created_at: string
          created_by: string | null
          establecimiento_id: string
          nombre: string
        }
        Insert: {
          actividad_id: string
          campos?: Json
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          nombre: string
        }
        Update: {
          actividad_id?: string
          campos?: Json
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "act_personalizada_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_personalizada_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_personalizada_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_personalizada_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      act_sanidad_productos: {
        Row: {
          actividad_id: string
          carencia_dias: number | null
          categoria: string
          created_at: string
          created_by: string | null
          dosis: string | null
          establecimiento_id: string
          fecha_proxima_dosis: string | null
          orden: number
          producto: string
          via: string | null
        }
        Insert: {
          actividad_id: string
          carencia_dias?: number | null
          categoria: string
          created_at?: string
          created_by?: string | null
          dosis?: string | null
          establecimiento_id: string
          fecha_proxima_dosis?: string | null
          orden: number
          producto: string
          via?: string | null
        }
        Update: {
          actividad_id?: string
          carencia_dias?: number | null
          categoria?: string
          created_at?: string
          created_by?: string | null
          dosis?: string | null
          establecimiento_id?: string
          fecha_proxima_dosis?: string | null
          orden?: number
          producto?: string
          via?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "act_sanidad_productos_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_sanidad_productos_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_sanidad_productos_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_sanidad_productos_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      act_servicio: {
        Row: {
          actividad_id: string
          created_at: string
          created_by: string | null
          establecimiento_id: string
          toros: number | null
          vacas_entoradas: number
        }
        Insert: {
          actividad_id: string
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          toros?: number | null
          vacas_entoradas: number
        }
        Update: {
          actividad_id?: string
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          toros?: number | null
          vacas_entoradas?: number
        }
        Relationships: [
          {
            foreignKeyName: "act_servicio_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_servicio_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_servicio_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "act_servicio_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      actividad_lineas: {
        Row: {
          actividad_id: string
          cabezas: number
          categoria_id: string
          created_at: string
          created_by: string | null
          establecimiento_id: string
          peso_vivo_total_kg: number | null
        }
        Insert: {
          actividad_id: string
          cabezas: number
          categoria_id: string
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          peso_vivo_total_kg?: number | null
        }
        Update: {
          actividad_id?: string
          cabezas?: number
          categoria_id?: string
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          peso_vivo_total_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "actividad_lineas_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividad_lineas_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividad_lineas_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividad_lineas_categoria_id_establecimiento_id_fkey"
            columns: ["categoria_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "categorias_animales"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividad_lineas_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      actividad_lotes: {
        Row: {
          actividad_id: string
          created_at: string
          created_by: string | null
          establecimiento_id: string
          lote_id: string
          rol: string
        }
        Insert: {
          actividad_id: string
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          lote_id: string
          rol: string
        }
        Update: {
          actividad_id?: string
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          lote_id?: string
          rol?: string
        }
        Relationships: [
          {
            foreignKeyName: "actividad_lotes_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividad_lotes_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividad_lotes_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividad_lotes_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actividad_lotes_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      actividades: {
        Row: {
          anulada_en: string | null
          anulada_por: string | null
          created_at: string
          created_by: string | null
          establecimiento_id: string
          fecha: string
          id: string
          lote_creado_id: string | null
          lote_id: string | null
          motivo_anulacion: string | null
          notas: string | null
          persona_id: string | null
          tipo: string
        }
        Insert: {
          anulada_en?: string | null
          anulada_por?: string | null
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          fecha: string
          id?: string
          lote_creado_id?: string | null
          lote_id?: string | null
          motivo_anulacion?: string | null
          notas?: string | null
          persona_id?: string | null
          tipo: string
        }
        Update: {
          anulada_en?: string | null
          anulada_por?: string | null
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          fecha?: string
          id?: string
          lote_creado_id?: string | null
          lote_id?: string | null
          motivo_anulacion?: string | null
          notas?: string | null
          persona_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "actividades_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actividades_lote_creado_id_establecimiento_id_fkey"
            columns: ["lote_creado_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividades_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividades_persona_id_establecimiento_id_fkey"
            columns: ["persona_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      archivos: {
        Row: {
          created_at: string
          created_by: string | null
          establecimiento_id: string
          id: string
          nombre: string
          ruta: string
          tamano_bytes: number
          tipo: string
          tipo_mime: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          id: string
          nombre: string
          ruta: string
          tamano_bytes: number
          tipo: string
          tipo_mime: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          id?: string
          nombre?: string
          ruta?: string
          tamano_bytes?: number
          tipo?: string
          tipo_mime?: string
        }
        Relationships: [
          {
            foreignKeyName: "archivos_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      bitacora_entradas: {
        Row: {
          anulada_en: string | null
          anulada_por: string | null
          completada_en: string | null
          completada_por: string | null
          created_at: string
          created_by: string | null
          editada_en: string | null
          editada_por: string | null
          entrada_origen_id: string | null
          establecimiento_id: string
          estado_idea: string | null
          estado_tarea: string | null
          fecha: string
          id: string
          motivo_anulacion: string | null
          persona_id: string | null
          repetir_cada_dias: number | null
          tarea_anterior_id: string | null
          texto: string
          tipo: string
          updated_at: string
          vencimiento: string | null
        }
        Insert: {
          anulada_en?: string | null
          anulada_por?: string | null
          completada_en?: string | null
          completada_por?: string | null
          created_at?: string
          created_by?: string | null
          editada_en?: string | null
          editada_por?: string | null
          entrada_origen_id?: string | null
          establecimiento_id: string
          estado_idea?: string | null
          estado_tarea?: string | null
          fecha?: string
          id?: string
          motivo_anulacion?: string | null
          persona_id?: string | null
          repetir_cada_dias?: number | null
          tarea_anterior_id?: string | null
          texto: string
          tipo: string
          updated_at?: string
          vencimiento?: string | null
        }
        Update: {
          anulada_en?: string | null
          anulada_por?: string | null
          completada_en?: string | null
          completada_por?: string | null
          created_at?: string
          created_by?: string | null
          editada_en?: string | null
          editada_por?: string | null
          entrada_origen_id?: string | null
          establecimiento_id?: string
          estado_idea?: string | null
          estado_tarea?: string | null
          fecha?: string
          id?: string
          motivo_anulacion?: string | null
          persona_id?: string | null
          repetir_cada_dias?: number | null
          tarea_anterior_id?: string | null
          texto?: string
          tipo?: string
          updated_at?: string
          vencimiento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bitacora_entradas_anterior_fkey"
            columns: ["tarea_anterior_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "bitacora_entradas"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "bitacora_entradas_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bitacora_entradas_origen_fkey"
            columns: ["entrada_origen_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "bitacora_entradas"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "bitacora_entradas_persona_id_establecimiento_id_fkey"
            columns: ["persona_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      bitacora_lotes: {
        Row: {
          created_at: string
          created_by: string | null
          entrada_id: string
          establecimiento_id: string
          lote_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entrada_id: string
          establecimiento_id: string
          lote_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entrada_id?: string
          establecimiento_id?: string
          lote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bitacora_lotes_entrada_id_establecimiento_id_fkey"
            columns: ["entrada_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "bitacora_entradas"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "bitacora_lotes_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bitacora_lotes_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      categorias_animales: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          cria_al_pie: boolean
          especie_id: string
          establecimiento_id: string
          id: string
          nombre: string
          orden: number
          sexo: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          cria_al_pie?: boolean
          especie_id: string
          establecimiento_id: string
          id?: string
          nombre: string
          orden?: number
          sexo?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          cria_al_pie?: boolean
          especie_id?: string
          establecimiento_id?: string
          id?: string
          nombre?: string
          orden?: number
          sexo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_animales_especie_id_establecimiento_id_fkey"
            columns: ["especie_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "especies"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "categorias_animales_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      concepto_grupos: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          establecimiento_id: string
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      conceptos: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          establecimiento_id: string
          grupo_id: string | null
          id: string
          nombre: string
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          grupo_id?: string | null
          id?: string
          nombre: string
          tipo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          grupo_id?: string | null
          id?: string
          nombre?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      especies: {
        Row: {
          activo: boolean
          color: string | null
          created_at: string
          created_by: string | null
          establecimiento_id: string
          grupo: string
          id: string
          nombre: string
          rubro_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          grupo?: string
          id?: string
          nombre: string
          rubro_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          grupo?: string
          id?: string
          nombre?: string
          rubro_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "especies_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "especies_rubro_fkey"
            columns: ["rubro_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "rubros"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      establecimientos: {
        Row: {
          created_at: string
          created_by: string | null
          departamento: string
          dicose: string | null
          estado: string
          fecha_alta: string
          id: string
          localidad: string | null
          nombre: string
          observaciones: string | null
          paraje: string | null
          propietario: string | null
          rut: string | null
          sistema_productivo: string | null
          superficie_total: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          departamento: string
          dicose?: string | null
          estado?: string
          fecha_alta?: string
          id?: string
          localidad?: string | null
          nombre: string
          observaciones?: string | null
          paraje?: string | null
          propietario?: string | null
          rut?: string | null
          sistema_productivo?: string | null
          superficie_total?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          departamento?: string
          dicose?: string | null
          estado?: string
          fecha_alta?: string
          id?: string
          localidad?: string | null
          nombre?: string
          observaciones?: string | null
          paraje?: string | null
          propietario?: string | null
          rut?: string | null
          sistema_productivo?: string | null
          superficie_total?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      lote_archivos: {
        Row: {
          archivo_id: string
          created_at: string
          created_by: string | null
          establecimiento_id: string
          heredado_de_lote_id: string | null
          lote_id: string
          ocultado_en: string | null
          ocultado_por: string | null
          oculto: boolean
        }
        Insert: {
          archivo_id: string
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          heredado_de_lote_id?: string | null
          lote_id: string
          ocultado_en?: string | null
          ocultado_por?: string | null
          oculto?: boolean
        }
        Update: {
          archivo_id?: string
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          heredado_de_lote_id?: string | null
          lote_id?: string
          ocultado_en?: string | null
          ocultado_por?: string | null
          oculto?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lote_archivos_archivo_id_establecimiento_id_fkey"
            columns: ["archivo_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "archivos"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lote_archivos_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_archivos_heredado_de_lote_id_establecimiento_id_fkey"
            columns: ["heredado_de_lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lote_archivos_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      lote_cambios_estado: {
        Row: {
          created_at: string
          created_by: string | null
          establecimiento_id: string
          fecha: string
          id: string
          lote_id: string
          motivo: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          fecha: string
          id?: string
          lote_id: string
          motivo?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          fecha?: string
          id?: string
          lote_id?: string
          motivo?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lote_cambios_estado_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_cambios_estado_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      lote_estadias: {
        Row: {
          anulada_en: string | null
          anulada_por: string | null
          cerrada_por: string | null
          created_at: string
          created_by: string | null
          establecimiento_id: string
          estadia_anterior_id: string | null
          fecha_ingreso: string
          fecha_salida: string | null
          id: string
          lote_id: string
          motivo: string | null
          motivo_anulacion: string | null
          motivo_salida: string | null
          origen: string
          potrero_id: string
          salida_registrada_en: string | null
          salida_registrada_por: string | null
        }
        Insert: {
          anulada_en?: string | null
          anulada_por?: string | null
          cerrada_por?: string | null
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          estadia_anterior_id?: string | null
          fecha_ingreso: string
          fecha_salida?: string | null
          id?: string
          lote_id: string
          motivo?: string | null
          motivo_anulacion?: string | null
          motivo_salida?: string | null
          origen: string
          potrero_id: string
          salida_registrada_en?: string | null
          salida_registrada_por?: string | null
        }
        Update: {
          anulada_en?: string | null
          anulada_por?: string | null
          cerrada_por?: string | null
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          estadia_anterior_id?: string | null
          fecha_ingreso?: string
          fecha_salida?: string | null
          id?: string
          lote_id?: string
          motivo?: string | null
          motivo_anulacion?: string | null
          motivo_salida?: string | null
          origen?: string
          potrero_id?: string
          salida_registrada_en?: string | null
          salida_registrada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_estadias_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_estadias_estadia_anterior_id_establecimiento_id_fkey"
            columns: ["estadia_anterior_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lote_estadias"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lote_estadias_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lote_estadias_potrero_id_establecimiento_id_fkey"
            columns: ["potrero_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "potreros"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lote_estadias_potrero_id_establecimiento_id_fkey"
            columns: ["potrero_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_potreros_mapa"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      lote_eventos: {
        Row: {
          actividad_id: string | null
          cabezas: number
          categoria_id: string
          created_at: string
          created_by: string | null
          especie_id: string
          establecimiento_id: string
          fecha: string
          id: string
          lote_id: string
          nota: string | null
          operacion_lote_id: string | null
          tipo: string
        }
        Insert: {
          actividad_id?: string | null
          cabezas: number
          categoria_id: string
          created_at?: string
          created_by?: string | null
          especie_id: string
          establecimiento_id: string
          fecha: string
          id?: string
          lote_id: string
          nota?: string | null
          operacion_lote_id?: string | null
          tipo: string
        }
        Update: {
          actividad_id?: string | null
          cabezas?: number
          categoria_id?: string
          created_at?: string
          created_by?: string | null
          especie_id?: string
          establecimiento_id?: string
          fecha?: string
          id?: string
          lote_id?: string
          nota?: string | null
          operacion_lote_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lote_eventos_actividad_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lote_eventos_actividad_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lote_eventos_actividad_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lote_eventos_categoria_id_especie_id_fkey"
            columns: ["categoria_id", "especie_id"]
            isOneToOne: false
            referencedRelation: "categorias_animales"
            referencedColumns: ["id", "especie_id"]
          },
          {
            foreignKeyName: "lote_eventos_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_eventos_lote_id_especie_id_fkey"
            columns: ["lote_id", "especie_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "especie_id"]
          },
          {
            foreignKeyName: "lote_eventos_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lote_eventos_operacion_lote_id_establecimiento_id_fkey"
            columns: ["operacion_lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "operaciones_lote"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      lotes: {
        Row: {
          anios_nacimiento: number[]
          created_at: string
          created_by: string | null
          especie_id: string
          establecimiento_id: string
          estado: string
          fecha_apertura: string
          fecha_cierre: string | null
          id: string
          nombre: string
          notas: string | null
          potrero_id: string | null
          updated_at: string
        }
        Insert: {
          anios_nacimiento?: number[]
          created_at?: string
          created_by?: string | null
          especie_id: string
          establecimiento_id: string
          estado?: string
          fecha_apertura: string
          fecha_cierre?: string | null
          id?: string
          nombre: string
          notas?: string | null
          potrero_id?: string | null
          updated_at?: string
        }
        Update: {
          anios_nacimiento?: number[]
          created_at?: string
          created_by?: string | null
          especie_id?: string
          establecimiento_id?: string
          estado?: string
          fecha_apertura?: string
          fecha_cierre?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          potrero_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_especie_id_establecimiento_id_fkey"
            columns: ["especie_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "especies"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lotes_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_potrero_id_establecimiento_id_fkey"
            columns: ["potrero_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "potreros"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "lotes_potrero_id_establecimiento_id_fkey"
            columns: ["potrero_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_potreros_mapa"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      membresias: {
        Row: {
          created_at: string
          created_by: string | null
          establecimiento_id: string
          id: string
          rol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          id?: string
          rol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          id?: string
          rol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membresias_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membresias_perfil_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      movimiento_archivos: {
        Row: {
          created_at: string
          created_by: string | null
          establecimiento_id: string
          id: string
          movimiento_id: string
          nombre: string
          ocultado_en: string | null
          ocultado_por: string | null
          oculto: boolean
          ruta: string
          tamano_bytes: number
          tipo_mime: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          id: string
          movimiento_id: string
          nombre: string
          ocultado_en?: string | null
          ocultado_por?: string | null
          oculto?: boolean
          ruta: string
          tamano_bytes: number
          tipo_mime: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          id?: string
          movimiento_id?: string
          nombre?: string
          ocultado_en?: string | null
          ocultado_por?: string | null
          oculto?: boolean
          ruta?: string
          tamano_bytes?: number
          tipo_mime?: string
        }
        Relationships: []
      }
      movimiento_titulares: {
        Row: {
          establecimiento_id: string
          monto: number
          movimiento_id: string
          titular_id: string
        }
        Insert: {
          establecimiento_id: string
          monto: number
          movimiento_id: string
          titular_id: string
        }
        Update: {
          establecimiento_id?: string
          monto?: number
          movimiento_id?: string
          titular_id?: string
        }
        Relationships: []
      }
      movimientos_economicos: {
        Row: {
          actividad_id: string | null
          anulado_en: string | null
          anulado_por: string | null
          concepto: string
          concepto_id: string | null
          contraparte: string | null
          created_at: string
          created_by: string | null
          editado_en: string | null
          editado_por: string | null
          establecimiento_id: string
          estado: string
          fecha: string
          fecha_pago: string | null
          fecha_vencimiento: string | null
          id: string
          lote_id: string | null
          moneda_original: string
          monto_original: number
          monto_usd: number | null
          motivo_anulacion: string | null
          origen: string
          rubro_id: string
          sentido: string
          tipo_cambio: number | null
          tipo_cambio_fecha: string | null
          tipo_cambio_fuente: string | null
          updated_at: string
        }
        Insert: {
          actividad_id?: string | null
          anulado_en?: string | null
          anulado_por?: string | null
          concepto: string
          concepto_id?: string | null
          contraparte?: string | null
          created_at?: string
          created_by?: string | null
          editado_en?: string | null
          editado_por?: string | null
          establecimiento_id: string
          estado: string
          fecha: string
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          lote_id?: string | null
          moneda_original: string
          monto_original: number
          monto_usd?: number | null
          motivo_anulacion?: string | null
          origen?: string
          rubro_id: string
          sentido: string
          tipo_cambio?: number | null
          tipo_cambio_fecha?: string | null
          tipo_cambio_fuente?: string | null
          updated_at?: string
        }
        Update: {
          actividad_id?: string | null
          anulado_en?: string | null
          anulado_por?: string | null
          concepto?: string
          concepto_id?: string | null
          contraparte?: string | null
          created_at?: string
          created_by?: string | null
          editado_en?: string | null
          editado_por?: string | null
          establecimiento_id?: string
          estado?: string
          fecha?: string
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          lote_id?: string | null
          moneda_original?: string
          monto_original?: number
          monto_usd?: number | null
          motivo_anulacion?: string | null
          origen?: string
          rubro_id?: string
          sentido?: string
          tipo_cambio?: number | null
          tipo_cambio_fecha?: string | null
          tipo_cambio_fuente?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_economicos_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "movimientos_economicos_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "movimientos_economicos_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "movimientos_economicos_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_economicos_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "movimientos_economicos_rubro_id_establecimiento_id_fkey"
            columns: ["rubro_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "rubros"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      operacion_lote_vinculos: {
        Row: {
          created_at: string
          created_by: string | null
          establecimiento_id: string
          lote_id: string
          operacion_id: string
          rol: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          lote_id: string
          operacion_id: string
          rol: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          lote_id?: string
          operacion_id?: string
          rol?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacion_lote_vinculos_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacion_lote_vinculos_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "operacion_lote_vinculos_operacion_id_establecimiento_id_fkey"
            columns: ["operacion_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "operaciones_lote"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      operaciones_lote: {
        Row: {
          actividad_id: string | null
          created_at: string
          created_by: string | null
          establecimiento_id: string
          fecha: string
          id: string
          notas: string | null
          tipo: string
        }
        Insert: {
          actividad_id?: string | null
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          fecha: string
          id?: string
          notas?: string | null
          tipo: string
        }
        Update: {
          actividad_id?: string | null
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          fecha?: string
          id?: string
          notas?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "operaciones_lote_actividad_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "operaciones_lote_actividad_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "operaciones_lote_actividad_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "operaciones_lote_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros: {
        Row: {
          activo: boolean
          clave: string
          created_at: string
          created_by: string | null
          id: string
          orden: number
          valor: string
        }
        Insert: {
          activo?: boolean
          clave: string
          created_at?: string
          created_by?: string | null
          id?: string
          orden?: number
          valor: string
        }
        Update: {
          activo?: boolean
          clave?: string
          created_at?: string
          created_by?: string | null
          id?: string
          orden?: number
          valor?: string
        }
        Relationships: []
      }
      perfiles: {
        Row: {
          activo: boolean
          apellido: string | null
          celular: string | null
          created_at: string
          created_by: string | null
          email: string
          es_admin: boolean
          foto_path: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          apellido?: string | null
          celular?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          es_admin?: boolean
          foto_path?: string | null
          id: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          apellido?: string | null
          celular?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          es_admin?: boolean
          foto_path?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      personas: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          establecimiento_id: string
          id: string
          nombre: string
          rol: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          id?: string
          nombre: string
          rol?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          id?: string
          nombre?: string
          rol?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personas_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      potreros: {
        Row: {
          aguada: boolean | null
          created_at: string
          created_by: string | null
          establecimiento_id: string
          estado: string
          forma: unknown
          id: string
          nombre: string
          observaciones: string | null
          sombra: boolean | null
          superficie: number
          tipo_pastura: string | null
          updated_at: string
          uso_actual: string | null
        }
        Insert: {
          aguada?: boolean | null
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          estado?: string
          forma?: unknown
          id?: string
          nombre: string
          observaciones?: string | null
          sombra?: boolean | null
          superficie: number
          tipo_pastura?: string | null
          updated_at?: string
          uso_actual?: string | null
        }
        Update: {
          aguada?: boolean | null
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          estado?: string
          forma?: unknown
          id?: string
          nombre?: string
          observaciones?: string | null
          sombra?: boolean | null
          superficie?: number
          tipo_pastura?: string | null
          updated_at?: string
          uso_actual?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "potreros_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      rubros: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          establecimiento_id: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubros_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      sanidad_dosis_dadas: {
        Row: {
          actividad_id: string
          dada_en: string
          dada_por: string | null
          deshecha_en: string | null
          deshecha_por: string | null
          establecimiento_id: string
          orden: number
        }
        Insert: {
          actividad_id: string
          dada_en?: string
          dada_por?: string | null
          deshecha_en?: string | null
          deshecha_por?: string | null
          establecimiento_id: string
          orden: number
        }
        Update: {
          actividad_id?: string
          dada_en?: string
          dada_por?: string | null
          deshecha_en?: string | null
          deshecha_por?: string | null
          establecimiento_id?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "sanidad_dosis_dadas_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "sanidad_dosis_dadas_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "sanidad_dosis_dadas_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "sanidad_dosis_dadas_actividad_id_orden_fkey"
            columns: ["actividad_id", "orden"]
            isOneToOne: true
            referencedRelation: "act_sanidad_productos"
            referencedColumns: ["actividad_id", "orden"]
          },
          {
            foreignKeyName: "sanidad_dosis_dadas_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_cambio: {
        Row: {
          compra: number
          consultado_en: string
          fecha: string
          fuente: string
          moneda: string
          venta: number
        }
        Insert: {
          compra: number
          consultado_en?: string
          fecha: string
          fuente: string
          moneda: string
          venta: number
        }
        Update: {
          compra?: number
          consultado_en?: string
          fecha?: string
          fuente?: string
          moneda?: string
          venta?: number
        }
        Relationships: []
      }
      titulares: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          establecimiento_id: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          establecimiento_id?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_actividades: {
        Row: {
          anulada_en: string | null
          anulada_por: string | null
          cabezas: number | null
          campos: Json | null
          causa: string | null
          contraparte: string | null
          created_at: string | null
          created_by: string | null
          establecimiento_id: string | null
          fecha: string | null
          id: string | null
          kg_gancho: number | null
          kg_lana_cabeza_aprox: number | null
          kg_lana_total: number | null
          lote_creado_id: string | null
          lote_cria_id: string | null
          lote_id: string | null
          lotes: string[] | null
          modalidad: string | null
          monto_usd: number | null
          motivo_anulacion: string | null
          nacidos_muertos: number | null
          notas: string | null
          observaciones: string | null
          persona_id: string | null
          personalizada: string | null
          peso_promedio_kg: number | null
          peso_vivo_total_kg: number | null
          producto: string | null
          productos: number | null
          rendimiento_pct: number | null
          tipo: string | null
          toros: number | null
          vacas_diagnosticadas: number | null
          vacas_entoradas: number | null
          vacas_prenadas: number | null
          vacas_vacias: number | null
        }
        Relationships: [
          {
            foreignKeyName: "actividades_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actividades_lote_creado_id_establecimiento_id_fkey"
            columns: ["lote_creado_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividades_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "actividades_persona_id_establecimiento_id_fkey"
            columns: ["persona_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      v_calendario: {
        Row: {
          actividad_id: string | null
          entrada_id: string | null
          establecimiento_id: string | null
          estado: string | null
          fecha: string | null
          hecha_en: string | null
          lotes: string[] | null
          orden: number | null
          origen: string | null
          persona_id: string | null
          repetir_cada_dias: number | null
          texto: string | null
        }
        Relationships: []
      }
      v_carencias: {
        Row: {
          actividad_id: string | null
          carencia_dias: number | null
          categoria: string | null
          establecimiento_id: string | null
          fecha: string | null
          fin_carencia: string | null
          heredada: boolean | null
          lote_id: string | null
          orden: number | null
          producto: string | null
        }
        Relationships: []
      }
      v_compraventas_sin_precio: {
        Row: {
          actividad_id: string | null
          cabezas: number | null
          contraparte: string | null
          establecimiento_id: string | null
          fecha: string | null
          lote_id: string | null
          tipo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actividades_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actividades_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      v_indicadores_aportes: {
        Row: {
          actividad_id: string | null
          cuenta: boolean | null
          destetadas: number | null
          diagnosticadas: number | null
          entoradas: number | null
          especie_id: string | null
          establecimiento_id: string | null
          fecha: string | null
          lote_id: string | null
          mixto: boolean | null
          nacidas_muertas: number | null
          nacidas_vivas: number | null
          prenadas: number | null
          temporada: number | null
          tipo: string | null
        }
        Relationships: []
      }
      v_indicadores_reproductivos: {
        Row: {
          destetadas: number | null
          destete_mixto: boolean | null
          diagnosticadas: number | null
          entoradas: number | null
          especie_id: string | null
          establecimiento_id: string | null
          nacidas_muertas: number | null
          nacidas_vivas: number | null
          pct_destete: number | null
          pct_paricion: number | null
          pct_prenez: number | null
          prenadas: number | null
          temporada: number | null
        }
        Relationships: []
      }
      v_movimientos_pendientes: {
        Row: {
          actividad_id: string | null
          concepto: string | null
          contraparte: string | null
          dias: number | null
          establecimiento_id: string | null
          fecha: string | null
          fecha_vencimiento: string | null
          id: string | null
          lote_id: string | null
          moneda_original: string | null
          monto_original: number | null
          monto_usd: number | null
          rubro: string | null
          rubro_id: string | null
          sentido: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_economicos_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "movimientos_economicos_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_actividades"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "movimientos_economicos_actividad_id_establecimiento_id_fkey"
            columns: ["actividad_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "v_compraventas_sin_precio"
            referencedColumns: ["actividad_id", "establecimiento_id"]
          },
          {
            foreignKeyName: "movimientos_economicos_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_economicos_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
          {
            foreignKeyName: "movimientos_economicos_rubro_id_establecimiento_id_fkey"
            columns: ["rubro_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "rubros"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      v_potreros_mapa: {
        Row: {
          aguada: boolean | null
          area_ha: number | null
          establecimiento_id: string | null
          estado: string | null
          etiqueta: Json | null
          forma: Json | null
          id: string | null
          nombre: string | null
          observaciones: string | null
          sombra: boolean | null
          superficie: number | null
          tipo_pastura: string | null
          uso_actual: string | null
        }
        Insert: {
          aguada?: boolean | null
          area_ha?: never
          establecimiento_id?: string | null
          estado?: string | null
          etiqueta?: never
          forma?: never
          id?: string | null
          nombre?: string | null
          observaciones?: string | null
          sombra?: boolean | null
          superficie?: number | null
          tipo_pastura?: string | null
          uso_actual?: string | null
        }
        Update: {
          aguada?: boolean | null
          area_ha?: never
          establecimiento_id?: string | null
          estado?: string | null
          etiqueta?: never
          forma?: never
          id?: string | null
          nombre?: string | null
          observaciones?: string | null
          sombra?: boolean | null
          superficie?: number | null
          tipo_pastura?: string | null
          uso_actual?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "potreros_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_resultado_detalle: {
        Row: {
          concepto: string | null
          concepto_id: string | null
          establecimiento_id: string | null
          grupo: string | null
          grupo_id: string | null
          mes: string | null
          monto_usd: number | null
          rubro: string | null
          rubro_id: string | null
          sentido: string | null
          titular: string | null
          titular_id: string | null
        }
        Relationships: []
      }
      v_resultado_rubro: {
        Row: {
          egresos_usd: number | null
          establecimiento_id: string | null
          ingresos_usd: number | null
          mes: string | null
          resultado_usd: number | null
          rubro: string | null
          rubro_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_economicos_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_economicos_rubro_id_establecimiento_id_fkey"
            columns: ["rubro_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "rubros"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
      v_stock_establecimiento: {
        Row: {
          cabezas: number | null
          categoria_id: string | null
          especie_id: string | null
          establecimiento_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_eventos_categoria_id_especie_id_fkey"
            columns: ["categoria_id", "especie_id"]
            isOneToOne: false
            referencedRelation: "categorias_animales"
            referencedColumns: ["id", "especie_id"]
          },
          {
            foreignKeyName: "lote_eventos_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_lote: {
        Row: {
          cabezas: number | null
          categoria_id: string | null
          especie_id: string | null
          establecimiento_id: string | null
          lote_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lote_eventos_categoria_id_especie_id_fkey"
            columns: ["categoria_id", "especie_id"]
            isOneToOne: false
            referencedRelation: "categorias_animales"
            referencedColumns: ["id", "especie_id"]
          },
          {
            foreignKeyName: "lote_eventos_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_eventos_lote_id_especie_id_fkey"
            columns: ["lote_id", "especie_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "especie_id"]
          },
          {
            foreignKeyName: "lote_eventos_lote_id_establecimiento_id_fkey"
            columns: ["lote_id", "establecimiento_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id", "establecimiento_id"]
          },
        ]
      }
    }
    Functions: {
      _actividad_ya_registrada: {
        Args: { p_establecimiento_id: string; p_id: string; p_tipo: string }
        Returns: boolean
      }
      _anios_de_jsonb: { Args: { p_valor: Json }; Returns: number[] }
      _anios_de_texto: { Args: { p_texto: string }; Returns: number[] }
      _archivo_permitido: {
        Args: { p_mime: string; p_nombre: string }
        Returns: boolean
      }
      _bloquear_entrada_bitacora: {
        Args: { p_entrada_id: string }
        Returns: {
          anulada_en: string | null
          anulada_por: string | null
          completada_en: string | null
          completada_por: string | null
          created_at: string
          created_by: string | null
          editada_en: string | null
          editada_por: string | null
          entrada_origen_id: string | null
          establecimiento_id: string
          estado_idea: string | null
          estado_tarea: string | null
          fecha: string
          id: string
          motivo_anulacion: string | null
          persona_id: string | null
          repetir_cada_dias: number | null
          tarea_anterior_id: string | null
          texto: string
          tipo: string
          updated_at: string
          vencimiento: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bitacora_entradas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _bloquear_lote_editable: {
        Args: { p_lote_id: string }
        Returns: {
          anios_nacimiento: number[]
          created_at: string
          created_by: string | null
          especie_id: string
          establecimiento_id: string
          estado: string
          fecha_apertura: string
          fecha_cierre: string | null
          id: string
          nombre: string
          notas: string | null
          potrero_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "lotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _bloquear_lotes_actividad: {
        Args: {
          p_establecimiento_id: string
          p_fecha: string
          p_lotes: string[]
        }
        Returns: undefined
      }
      _cabezas: { Args: { p_valor: Json }; Returns: number }
      _cargar_catalogos_base: {
        Args: { p_establecimiento_id: string }
        Returns: undefined
      }
      _cerrar_si_vacio: {
        Args: { p_fecha: string; p_lote_id: string; p_motivo: string }
        Returns: boolean
      }
      _entero_jsonb: {
        Args: { p_campo: string; p_valor: Json }
        Returns: number
      }
      _exigir_categoria: {
        Args: { p_categoria_id: string; p_especie_id: string }
        Returns: undefined
      }
      _exigir_persona: {
        Args: { p_establecimiento_id: string; p_persona_id: string }
        Returns: undefined
      }
      _guardar_lotes_bitacora: {
        Args: {
          p_entrada_id: string
          p_establecimiento_id: string
          p_lotes: string[]
        }
        Returns: undefined
      }
      _insertar_lineas: {
        Args: {
          p_actividad_id: string
          p_especie_id: string
          p_establecimiento_id: string
          p_lineas: Json
          p_peso: string
        }
        Returns: string[]
      }
      _precio_valido: {
        Args: { p_precio: Json }
        Returns: Record<string, unknown>
      }
      _registrar_movimiento: {
        Args: {
          p_actividad_id: string
          p_concepto: string
          p_contraparte: string
          p_especie_id: string
          p_establecimiento_id: string
          p_fecha: string
          p_lote_id: string
          p_precio: Json
          p_sentido: string
        }
        Returns: string
      }
      _rubro_de_especie: {
        Args: { p_especie_id: string; p_establecimiento_id: string }
        Returns: string
      }
      _sincronizar_potrero_lote: {
        Args: { p_lote_id: string }
        Returns: undefined
      }
      _stock_categoria_al: {
        Args: { p_categoria_id: string; p_fecha: string; p_lote_id: string }
        Returns: number
      }
      _validar_datos_tarea: {
        Args: {
          p_repetir_cada_dias: number
          p_tipo: string
          p_vencimiento: string
        }
        Returns: undefined
      }
      _validar_entrada_bitacora: {
        Args: {
          p_establecimiento_id: string
          p_fecha: string
          p_persona_id: string
          p_texto: string
          p_tipo: string
        }
        Returns: undefined
      }
      _validar_fecha_operacion: {
        Args: { p_apertura: string; p_fecha: string }
        Returns: undefined
      }
      _validar_saldo: {
        Args: { p_categoria_id: string; p_lote_id: string }
        Returns: undefined
      }
      adjuntar_archivo_movimiento: {
        Args: { p_archivo_id: string; p_movimiento_id: string; p_nombre: string }
        Returns: string
      }
      adjuntar_archivo_lote: {
        Args: {
          p_archivo_id: string
          p_lote_id: string
          p_nombre: string
          p_tipo?: string
        }
        Returns: string
      }
      anular_actividad: {
        Args: { p_actividad_id: string; p_motivo: string }
        Returns: undefined
      }
      anular_entrada_bitacora: {
        Args: { p_entrada_id: string; p_motivo: string }
        Returns: undefined
      }
      anular_movimiento: {
        Args: { p_motivo: string; p_movimiento_id: string }
        Returns: undefined
      }
      asignar_rol: {
        Args: { p_establecimiento_id: string; p_rol: string; p_user_id: string }
        Returns: undefined
      }
      cambiar_estado_idea: {
        Args: { p_entrada_id: string; p_estado: string }
        Returns: undefined
      }
      cambiar_estado_tarea: {
        Args: { p_entrada_id: string; p_estado: string }
        Returns: string
      }
      cambiar_potrero_lote: {
        Args: {
          p_fecha_ingreso?: string
          p_fecha_salida?: string
          p_lote_id: string
          p_motivo?: string
          p_potrero_id: string
        }
        Returns: string
      }
      cargar_precio_actividad: {
        Args: {
          p_actividad_id: string
          p_id: string
          p_precio: Json
          p_rubro_id?: string
        }
        Returns: string
      }
      cerrar_lote: {
        Args: { p_fecha: string; p_lote_id: string; p_motivo?: string }
        Returns: undefined
      }
      crear_entrada_bitacora: {
        Args: {
          p_entrada_origen_id?: string
          p_establecimiento_id: string
          p_fecha: string
          p_lotes?: string[]
          p_persona_id?: string
          p_repetir_cada_dias?: number
          p_texto: string
          p_tipo: string
          p_vencimiento?: string
        }
        Returns: string
      }
      crear_establecimiento: {
        Args: {
          p_cargar_catalogos_base?: boolean
          p_departamento: string
          p_dicose?: string
          p_fecha_alta?: string
          p_localidad?: string
          p_nombre: string
          p_observaciones?: string
          p_paraje?: string
          p_propietario?: string
          p_rut?: string
          p_sistema_productivo?: string
          p_superficie_total?: number
        }
        Returns: string
      }
      crear_lote: {
        Args: {
          p_anios_nacimiento?: number[]
          p_composicion: Json
          p_especie_id: string
          p_establecimiento_id: string
          p_fecha_apertura: string
          p_nombre: string
          p_notas?: string
          p_potrero_id?: string
        }
        Returns: string
      }
      definir_activo: {
        Args: { p_activo: boolean; p_user_id: string }
        Returns: undefined
      }
      definir_admin: {
        Args: { p_es_admin: boolean; p_user_id: string }
        Returns: undefined
      }
      deshacer_cambio_potrero: {
        Args: { p_lote_id: string; p_motivo?: string }
        Returns: undefined
      }
      dividir_lote: {
        Args: {
          p_destinos: Json
          p_fecha: string
          p_lote_id: string
          p_notas?: string
        }
        Returns: string
      }
      editar_entrada_bitacora: {
        Args: {
          p_entrada_id: string
          p_fecha: string
          p_lotes?: string[]
          p_persona_id?: string
          p_repetir_cada_dias?: number
          p_texto: string
          p_tipo: string
          p_vencimiento?: string
        }
        Returns: undefined
      }
      es_admin: { Args: never; Returns: boolean }
      es_miembro: { Args: { p_est: string }; Returns: boolean }
      fecha_hoy: { Args: never; Returns: string }
      editar_movimiento: {
        Args: {
          p_concepto_id: string
          p_contraparte?: string
          p_fecha: string
          p_lote_id?: string
          p_movimiento_id: string
          p_precio: Json
          p_rubro_id: string
          p_sentido: string
          p_titulares?: Json
        }
        Returns: undefined
      }
      guardar_forma_potrero: {
        Args: {
          p_actualizar_superficie?: boolean
          p_forma: Json
          p_potrero_id: string
        }
        Returns: number
      }
      linaje_lote: {
        Args: { p_lote_id: string }
        Returns: {
          estado: string
          fecha: string
          lote_id: string
          nivel: number
          nombre: string
          operacion_id: string
          relacion: string
          tipo: string
        }[]
      }
      marcar_dosis_dada: {
        Args: { p_actividad_id: string; p_dada?: boolean; p_orden: number }
        Returns: undefined
      }
      marcar_pagado: {
        Args: { p_fecha_pago: string; p_movimiento_id: string }
        Returns: undefined
      }
      mi_rol: { Args: { p_est: string }; Returns: string }
      potreros_superpuestos: {
        Args: { p_establecimiento_id: string }
        Returns: {
          hectareas: number
          potrero_a: string
          potrero_b: string
        }[]
      }
      puede_operar: { Args: { p_est: string }; Returns: boolean }
      quitar_acceso: {
        Args: { p_establecimiento_id: string; p_user_id: string }
        Returns: undefined
      }
      quitar_archivo_lote: {
        Args: { p_archivo_id: string; p_lote_id: string }
        Returns: undefined
      }
      quitar_archivo_movimiento: {
        Args: { p_archivo_id: string }
        Returns: undefined
      }
      reabrir_lote: {
        Args: { p_fecha: string; p_lote_id: string; p_motivo?: string }
        Returns: undefined
      }
      recategorizar_lote: {
        Args: {
          p_cambios: Json
          p_fecha: string
          p_lote_id: string
          p_notas?: string
        }
        Returns: string
      }
      registrar_ajuste: {
        Args: {
          p_cabezas: number
          p_categoria_id: string
          p_fecha: string
          p_lote_id: string
          p_nota: string
        }
        Returns: string
      }
      registrar_compra: {
        Args: {
          p_contraparte?: string
          p_establecimiento_id: string
          p_fecha: string
          p_id: string
          p_kg_gancho?: number
          p_lineas: Json
          p_lote_id?: string
          p_lote_nuevo?: Json
          p_modalidad: string
          p_notas?: string
          p_persona_id?: string
          p_precio?: Json
        }
        Returns: string
      }
      registrar_destete: {
        Args: {
          p_destinos: Json
          p_establecimiento_id: string
          p_fecha: string
          p_id: string
          p_notas?: string
          p_origenes: Json
          p_persona_id?: string
        }
        Returns: string
      }
      registrar_diagnostico: {
        Args: {
          p_fecha: string
          p_id: string
          p_lote_id: string
          p_notas?: string
          p_persona_id?: string
          p_vacas_diagnosticadas: number
          p_vacas_prenadas: number
        }
        Returns: string
      }
      registrar_esquila: {
        Args: {
          p_establecimiento_id: string
          p_fecha: string
          p_id: string
          p_kg_lana_total: number
          p_lotes: string[]
          p_notas?: string
          p_persona_id?: string
        }
        Returns: string
      }
      registrar_mortandad: {
        Args: {
          p_causa?: string
          p_fecha: string
          p_id: string
          p_lineas: Json
          p_lote_id: string
          p_notas?: string
          p_observaciones?: string
          p_persona_id?: string
        }
        Returns: string
      }
      registrar_movimiento: {
        Args: {
          p_concepto_id: string
          p_contraparte?: string
          p_establecimiento_id: string
          p_fecha: string
          p_id: string
          p_lote_id?: string
          p_precio: Json
          p_rubro_id: string
          p_sentido: string
          p_titulares?: Json
        }
        Returns: string
      }
      registrar_paricion: {
        Args: {
          p_fecha: string
          p_id: string
          p_lineas: Json
          p_lote_cria_id?: string
          p_lote_cria_nuevo?: Json
          p_lote_madres_id: string
          p_nacidos_muertos?: number
          p_notas?: string
          p_persona_id?: string
        }
        Returns: string
      }
      registrar_personalizada: {
        Args: {
          p_campos?: Json
          p_establecimiento_id: string
          p_fecha: string
          p_id: string
          p_lotes: string[]
          p_nombre: string
          p_notas?: string
          p_persona_id?: string
        }
        Returns: string
      }
      registrar_pesada: {
        Args: {
          p_fecha: string
          p_id: string
          p_lineas: Json
          p_lote_id: string
          p_notas?: string
          p_persona_id?: string
        }
        Returns: string
      }
      registrar_sanidad: {
        Args: {
          p_establecimiento_id: string
          p_fecha: string
          p_id: string
          p_lotes: string[]
          p_notas?: string
          p_persona_id?: string
          p_productos: Json
        }
        Returns: string
      }
      registrar_servicio: {
        Args: {
          p_fecha: string
          p_id: string
          p_lote_id: string
          p_notas?: string
          p_persona_id?: string
          p_toros?: number
          p_vacas_entoradas: number
        }
        Returns: string
      }
      registrar_venta: {
        Args: {
          p_contraparte?: string
          p_fecha: string
          p_id: string
          p_kg_gancho?: number
          p_lineas: Json
          p_lote_id: string
          p_modalidad: string
          p_notas?: string
          p_persona_id?: string
          p_precio?: Json
        }
        Returns: string
      }
      restaurar_archivo_lote: {
        Args: { p_archivo_id: string; p_lote_id: string }
        Returns: undefined
      }
      restaurar_entrada_bitacora: {
        Args: { p_entrada_id: string }
        Returns: undefined
      }
      stock_al: {
        Args: { p_establecimiento_id: string; p_fecha: string }
        Returns: {
          cabezas: number
          categoria_id: string
          especie_id: string
        }[]
      }
      unir_lotes: {
        Args: {
          p_destino_id?: string
          p_fecha: string
          p_lotes_origen: string[]
          p_notas?: string
          p_nuevo?: Json
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
