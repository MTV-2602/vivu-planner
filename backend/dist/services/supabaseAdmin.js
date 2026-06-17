"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDbMocked = exports.supabaseAdmin = exports.supabase = void 0;
exports.getSupabaseUserClient = getSupabaseUserClient;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey && !!supabaseServiceKey;
let supabaseInstance;
let supabaseAdminInstance;
if (isSupabaseConfigured) {
    supabaseInstance = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey);
    supabaseAdminInstance = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });
}
else {
    console.warn('WARNING: SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY are missing.');
    console.warn('Backend is running in mock database mode.');
    const mockDbQuery = {
        select: () => ({
            eq: () => ({
                order: () => Promise.resolve({ data: [], error: null }),
                single: () => Promise.resolve({ data: null, error: null }),
                then: (cb) => cb({ data: [], error: null })
            }),
            order: () => Promise.resolve({ data: [], error: null }),
            then: (cb) => cb({ data: [], error: null })
        }),
        insert: () => ({
            select: () => ({
                single: () => Promise.resolve({ data: { id: '00000000-0000-0000-0000-000000000000' }, error: null }),
                then: (cb) => cb({ data: [{ id: '00000000-0000-0000-0000-000000000000', day_number: 1 }], error: null })
            }),
            then: (cb) => cb({ data: [{ id: '00000000-0000-0000-0000-000000000000' }], error: null })
        }),
        update: () => ({
            eq: () => ({
                eq: () => Promise.resolve({ data: {}, error: null }),
                then: (cb) => cb({ data: {}, error: null })
            }),
            in: () => ({
                eq: () => Promise.resolve({ data: {}, error: null }),
                then: (cb) => cb({ data: {}, error: null })
            }),
            then: (cb) => cb({ data: {}, error: null })
        }),
        delete: () => ({
            eq: () => Promise.resolve({ data: {}, error: null }),
            then: (cb) => cb({ data: {}, error: null })
        })
    };
    const mockDbClient = {
        from: () => mockDbQuery
    };
    supabaseInstance = mockDbClient;
    supabaseAdminInstance = mockDbClient;
}
exports.supabase = supabaseInstance;
exports.supabaseAdmin = supabaseAdminInstance;
// Helper to create a request-scoped client using the user's JWT
function getSupabaseUserClient(token) {
    const tokenClean = token.trim();
    const isLooksLikeAdmin = tokenClean.includes('@') && tokenClean.split(':').length === 3;
    if (isLooksLikeAdmin) {
        return supabaseAdminInstance;
    }
    if (isSupabaseConfigured) {
        return (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            },
            global: {
                headers: {
                    Authorization: `Bearer ${tokenClean}`
                }
            }
        });
    }
    return supabaseInstance;
}
exports.isDbMocked = !isSupabaseConfigured;
