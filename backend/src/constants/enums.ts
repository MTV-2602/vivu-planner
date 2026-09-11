/**
 * Enums chuẩn hóa cho toàn bộ Backend ViVu Planner v2.0
 * Ánh xạ 1-1 với PostgreSQL Enums trong supabase/schema.sql
 */

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum TripStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export enum TravelerType {
  SOLO = 'solo',
  COUPLE = 'couple',
  FAMILY = 'family',
  FRIENDS = 'friends',
  OTHER = 'other',
}

export enum ItineraryItemType {
  ACCOMMODATION = 'accommodation',
  TRANSPORT = 'transport',
  DINING = 'dining',
  ATTRACTION = 'attraction',
  RENTAL = 'rental',
  EXPERIENCE = 'experience',
}

export enum ItineraryItemStatus {
  PLANNED = 'planned',
  CONFIRMED = 'confirmed',
  SKIPPED = 'skipped',
  REPLACED = 'replaced',
}

export enum DisruptionType {
  DELAY = 'delay',
  BUDGET_SHORTAGE = 'budget_shortage',
  HEALTH_ISSUE = 'health_issue',
  WEATHER_CHANGE = 'weather_change',
  OTHER = 'other',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  PAYOS = 'payos',
  MOMO = 'momo',
  ADMIN = 'admin',
}

export enum ApiKeyStatus {
  ACTIVE = 'active',
  RATE_LIMITED = 'rate_limited',
  QUOTA_EXCEEDED = 'quota_exceeded',
  INVALID = 'invalid',
  DISABLED = 'disabled',
}

export enum PartnerCategory {
  HOTEL = 'hotel',
  HOMESTAY = 'homestay',
  RESORT = 'resort',
  RESTAURANT = 'restaurant',
  CAFE = 'cafe',
  ATTRACTION = 'attraction',
  TRANSPORT = 'transport',
  EXPERIENCE = 'experience',
}

export enum ChatMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  MODEL = 'model',
}
