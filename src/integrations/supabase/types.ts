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
      activity: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["activity_kind"]
          media_id: string | null
          payload: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["activity_kind"]
          media_id?: string | null
          payload?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          media_id?: string | null
          payload?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friend_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friend_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friend_status"]
          updated_at?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          backdrop_url: string | null
          cached_at: string
          external_id: string
          genres: string[] | null
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          original_title: string | null
          overview: string | null
          poster_url: string | null
          raw: Json | null
          release_year: number | null
          runtime: number | null
          season_count: number | null
          source: string
          status: string | null
          title: string
          vote_average: number | null
        }
        Insert: {
          backdrop_url?: string | null
          cached_at?: string
          external_id: string
          genres?: string[] | null
          id?: string
          media_type: Database["public"]["Enums"]["media_type"]
          original_title?: string | null
          overview?: string | null
          poster_url?: string | null
          raw?: Json | null
          release_year?: number | null
          runtime?: number | null
          season_count?: number | null
          source?: string
          status?: string | null
          title: string
          vote_average?: number | null
        }
        Update: {
          backdrop_url?: string | null
          cached_at?: string
          external_id?: string
          genres?: string[] | null
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          original_title?: string | null
          overview?: string | null
          poster_url?: string | null
          raw?: Json | null
          release_year?: number | null
          runtime?: number | null
          season_count?: number | null
          source?: string
          status?: string | null
          title?: string
          vote_average?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json | null
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json | null
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          read_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          id: string
          user_id: string
          media_id: string
          body: string
          likes: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          media_id: string
          body: string
          likes?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          media_id?: string
          body?: string
          likes?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      review_likes: {
        Row: {
          id: string
          review_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          review_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          review_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_likes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          is_public: boolean
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_public?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_public?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          air_date: string | null
          episode_count: number | null
          id: string
          media_id: string
          name: string | null
          overview: string | null
          poster_url: string | null
          season_number: number
        }
        Insert: {
          air_date?: string | null
          episode_count?: number | null
          id?: string
          media_id: string
          name?: string | null
          overview?: string | null
          poster_url?: string | null
          season_number: number
        }
        Update: {
          air_date?: string | null
          episode_count?: number | null
          id?: string
          media_id?: string
          name?: string | null
          overview?: string | null
          poster_url?: string | null
          season_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "seasons_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      user_media: {
        Row: {
          created_at: string
          favorite: boolean
          hidden: boolean
          id: string
          media_id: string
          notes: string | null
          progress: number
          rating: number | null
          status: Database["public"]["Enums"]["watch_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          favorite?: boolean
          hidden?: boolean
          id?: string
          media_id: string
          notes?: string | null
          progress?: number
          rating?: number | null
          status?: Database["public"]["Enums"]["watch_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          favorite?: boolean
          hidden?: boolean
          id?: string
          media_id?: string
          notes?: string | null
          progress?: number
          rating?: number | null
          status?: Database["public"]["Enums"]["watch_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
        ]
      }
      user_seasons: {
        Row: {
          id: string
          season_id: string
          status: Database["public"]["Enums"]["watch_status"]
          updated_at: string
          user_id: string
          user_media_id: string
        }
        Insert: {
          id?: string
          season_id: string
          status?: Database["public"]["Enums"]["watch_status"]
          updated_at?: string
          user_id: string
          user_media_id: string
        }
        Update: {
          id?: string
          season_id?: string
          status?: Database["public"]["Enums"]["watch_status"]
          updated_at?: string
          user_id?: string
          user_media_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_seasons_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_seasons_user_media_id_fkey"
            columns: ["user_media_id"]
            isOneToOne: false
            referencedRelation: "user_media"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      are_friends: { Args: { a: string; b: string }; Returns: boolean }
    }
    Enums: {
      activity_kind:
        | "started"
        | "completed"
        | "added"
        | "favorited"
        | "rated"
        | "friend_joined"
      friend_status: "pending" | "accepted" | "blocked"
      media_type: "movie" | "tv" | "anime"
      watch_status:
        | "watching"
        | "completed"
        | "planned"
        | "paused"
        | "dropped"
        | "skipped"
        | "rewatching"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_kind: [
        "started",
        "completed",
        "added",
        "favorited",
        "rated",
        "friend_joined",
      ],
      friend_status: ["pending", "accepted", "blocked"],
      media_type: ["movie", "tv", "anime"],
      watch_status: [
        "watching",
        "completed",
        "planned",
        "paused",
        "dropped",
        "skipped",
        "rewatching",
      ],
    },
  },
} as const
