// ==========================================================
// Supabase connection (shared across every page)
// ==========================================================
const SUPABASE_URL = "https://qniqmsdmiifbailzotlq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuaXFtc2RtaWlmYmFpbHpvdGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMDIxNDQsImV4cCI6MjEwMjg3ODE0NH0.McPZuHYW0UivNEwq9Vpoi4biZv9GHr_pBsWERQ7N8l4";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 5 } }
});

window.sb = sb;
