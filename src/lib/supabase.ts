import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          nutrition_goal: string | null;
          nutrition_style: string | null;
          age: number | null;
          sex: string | null;
          height_cm: number | null;
          weight_kg: number | null;
          activity_level: string | null;
          target_calories: number | null;
          target_protein: number | null;
          target_carbs: number | null;
          target_fat: number | null;
          nutrition_profile_updated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          display_name?: string | null;
          nutrition_goal?: string | null;
          nutrition_style?: string | null;
          age?: number | null;
          sex?: string | null;
          height_cm?: number | null;
          weight_kg?: number | null;
          activity_level?: string | null;
          target_calories?: number | null;
          target_protein?: number | null;
          target_carbs?: number | null;
          target_fat?: number | null;
          nutrition_profile_updated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          nutrition_goal?: string | null;
          nutrition_style?: string | null;
          age?: number | null;
          sex?: string | null;
          height_cm?: number | null;
          weight_kg?: number | null;
          activity_level?: string | null;
          target_calories?: number | null;
          target_protein?: number | null;
          target_carbs?: number | null;
          target_fat?: number | null;
          nutrition_profile_updated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      token_wallets: {
        Row: {
          id: string;
          user_id: string;
          balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          balance?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      token_transactions: {
        Row: {
          id: string;
          user_id: string;
          wallet_id: string | null;
          type: 'initial' | 'spend' | 'purchase_test';
          amount: number;
          reason: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          wallet_id?: string | null;
          type: 'initial' | 'spend' | 'purchase_test';
          amount: number;
          reason: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          type?: 'initial' | 'spend' | 'purchase_test';
          amount?: number;
          reason?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      food_entries: {
        Row: {
          id: string;
          user_id: string;
          food_key: string | null;
          name: string;
          source: string | null;
          calories: number;
          quantity: string | null;
          quantity_value: number | null;
          unit: string | null;
          protein: number | null;
          carbs: number | null;
          fat: number | null;
          base_quantity: number | null;
          base_calories: number | null;
          base_protein: number | null;
          base_carbs: number | null;
          base_fat: number | null;
          meal_label: string | null;
          meal_type?: string | null;
          entry_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          food_key?: string | null;
          name: string;
          source?: string | null;
          calories: number;
          quantity?: string | null;
          quantity_value?: number | null;
          unit?: string | null;
          protein?: number | null;
          carbs?: number | null;
          fat?: number | null;
          base_quantity?: number | null;
          base_calories?: number | null;
          base_protein?: number | null;
          base_carbs?: number | null;
          base_fat?: number | null;
          meal_label?: string | null;
          entry_date: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          food_key?: string | null;
          name?: string;
          source?: string | null;
          calories?: number;
          quantity?: string | null;
          quantity_value?: number | null;
          unit?: string | null;
          protein?: number | null;
          carbs?: number | null;
          fat?: number | null;
          base_quantity?: number | null;
          base_calories?: number | null;
          base_protein?: number | null;
          base_carbs?: number | null;
          base_fat?: number | null;
          meal_label?: string | null;
          entry_date?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      custom_foods: {
        Row: {
          id: string;
          user_id: string;
          food_key: string | null;
          barcode: string | null;
          name: string;
          category: string | null;
          base_quantity: number;
          unit: string;
          calories: number;
          base_calories: number | null;
          protein: number;
          carbs: number;
          fat: number;
          keywords: string[];
          serving_presets: Json | null;
          source: 'custom' | 'barcode';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          food_key?: string | null;
          barcode?: string | null;
          name: string;
          category?: string | null;
          base_quantity: number;
          unit: string;
          calories: number;
          base_calories?: number | null;
          protein: number;
          carbs: number;
          fat: number;
          keywords?: string[];
          serving_presets?: Json | null;
          source?: 'custom' | 'barcode';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          food_key?: string | null;
          barcode?: string | null;
          name?: string;
          category?: string | null;
          base_quantity?: number;
          unit?: string;
          calories?: number;
          base_calories?: number | null;
          protein?: number;
          carbs?: number;
          fat?: number;
          keywords?: string[];
          serving_presets?: Json | null;
          source?: 'custom' | 'barcode';
          updated_at?: string;
        };
        Relationships: [];
      };
      meals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: string;
          source: string;
          base_quantity: number;
          unit: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          keywords: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category?: string;
          source?: string;
          base_quantity?: number;
          unit?: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          keywords?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          category?: string;
          source?: string;
          base_quantity?: number;
          unit?: string;
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          keywords?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      meal_ingredients: {
        Row: {
          id: string;
          meal_id: string;
          user_id: string;
          food_id: string;
          source: string | null;
          name: string;
          quantity: number;
          unit: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          base_quantity: number | null;
          base_calories: number | null;
          base_protein: number | null;
          base_carbs: number | null;
          base_fat: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          meal_id: string;
          user_id: string;
          food_id: string;
          source?: string | null;
          name: string;
          quantity: number;
          unit: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          base_quantity?: number | null;
          base_calories?: number | null;
          base_protein?: number | null;
          base_carbs?: number | null;
          base_fat?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          food_id?: string;
          source?: string | null;
          name?: string;
          quantity?: number;
          unit?: string;
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          base_quantity?: number | null;
          base_calories?: number | null;
          base_protein?: number | null;
          base_carbs?: number | null;
          base_fat?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      scanned_foods_cache: {
        Row: {
          id: string;
          user_id: string;
          barcode: string;
          food_key: string | null;
          name: string;
          category: string | null;
          base_quantity: number;
          unit: string;
          calories: number | null;
          base_calories: number;
          protein: number;
          carbs: number;
          fat: number;
          base_protein: number;
          base_carbs: number;
          base_fat: number;
          keywords: string[];
          serving_presets: Json | null;
          source: 'barcode';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          barcode: string;
          food_key?: string | null;
          name: string;
          category?: string | null;
          base_quantity: number;
          unit: string;
          calories?: number | null;
          base_calories: number;
          protein: number;
          carbs: number;
          fat: number;
          base_protein?: number;
          base_carbs?: number;
          base_fat?: number;
          keywords?: string[];
          serving_presets?: Json | null;
          source?: 'barcode';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          barcode?: string;
          food_key?: string | null;
          name?: string;
          category?: string | null;
          base_quantity?: number;
          unit?: string;
          calories?: number | null;
          base_calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          base_protein?: number;
          base_carbs?: number;
          base_fat?: number;
          keywords?: string[];
          serving_presets?: Json | null;
          source?: 'barcode';
          updated_at?: string;
        };
        Relationships: [];
      };
      daily_logging_streaks: {
        Row: {
          id: string;
          user_id: string;
          current_streak: number;
          longest_streak: number;
          last_logged_date: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          current_streak?: number;
          longest_streak?: number;
          last_logged_date?: string | null;
          updated_at?: string;
        };
        Update: {
          current_streak?: number;
          longest_streak?: number;
          last_logged_date?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
  };
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
