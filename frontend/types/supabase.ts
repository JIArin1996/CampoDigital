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
      categorias_animales: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          especie_id: string
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
          especie_id: string
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
          especie_id?: string
          establecimiento_id?: string
          id?: string
          nombre?: string
          orden?: number
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
      especies: {
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
            foreignKeyName: "especies_establecimiento_id_fkey"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "establecimientos"
            referencedColumns: ["id"]
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
      lote_eventos: {
        Row: {
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
          campana: string | null
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
          campana?: string | null
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
          campana?: string | null
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
          created_at: string
          created_by: string | null
          establecimiento_id: string
          fecha: string
          id: string
          notas: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          establecimiento_id: string
          fecha: string
          id?: string
          notas?: string | null
          tipo: string
        }
        Update: {
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
    }
    Views: {
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
      _bloquear_lote_editable: {
        Args: { p_lote_id: string }
        Returns: {
          campana: string | null
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
      _cargar_catalogos_base: {
        Args: { p_establecimiento_id: string }
        Returns: undefined
      }
      _validar_saldo: {
        Args: { p_categoria_id: string; p_lote_id: string }
        Returns: undefined
      }
      asignar_rol: {
        Args: { p_establecimiento_id: string; p_rol: string; p_user_id: string }
        Returns: undefined
      }
      cerrar_lote: {
        Args: { p_fecha: string; p_lote_id: string; p_motivo?: string }
        Returns: undefined
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
          p_campana?: string
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
      es_admin: { Args: never; Returns: boolean }
      es_miembro: { Args: { p_est: string }; Returns: boolean }
      fecha_hoy: { Args: never; Returns: string }
      mi_rol: { Args: { p_est: string }; Returns: string }
      puede_operar: { Args: { p_est: string }; Returns: boolean }
      quitar_acceso: {
        Args: { p_establecimiento_id: string; p_user_id: string }
        Returns: undefined
      }
      reabrir_lote: {
        Args: { p_fecha: string; p_lote_id: string; p_motivo?: string }
        Returns: undefined
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
