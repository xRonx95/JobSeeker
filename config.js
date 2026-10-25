
"use strict";

// Isabela Careers - Supabase Configuration
// Public browser configuration only.

window.ISABELA_SUPABASE_URL =
  "https://hderthposugfbijwvvjm.supabase.co";

window.ISABELA_SUPABASE_KEY =
  "sb_publishable_5TMToDJel8DYgokkgekUuA_01COtXBl";

// HTTPS deployments use the Vercel rewrites. Plain local static servers connect
// directly. Keep the original project URL so existing login sessions are retained.
window.ISABELA_SUPABASE_PROXY = window.location?.protocol === 'https:' ? '/supabase' : '';
