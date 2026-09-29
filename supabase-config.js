/* ==========================================================================
   KONFIGURASI SUPABASE
   --------------------------------------------------------------------------
   File ini menyimpan kredensial publik Supabase.
   anon key AMAN untuk dipakai di frontend.
   JANGAN taruh service_role key di sini!
   ========================================================================== */

window.SUPABASE_CONFIG = {
    url: 'https://dsajffovimzwaaxfsdel.supabase.co',  // ← GANTI dengan URL kamu
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzYWpmZm92aW16d2FheGZzZGVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODEyMDUsImV4cCI6MjEwNjI1NzIwNX0.ozzjPsqYdkMTBayBhIkItN4iRo-kotq37eJoeWqJvKo'  // ← GANTI dengan anon key kamu
};