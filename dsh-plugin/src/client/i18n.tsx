/** Page-local English/Indonesian copy. Defaults to English and never follows the browser. */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/** Supported page languages. */
export type Language = 'en' | 'id'

/** Indonesian copy keyed by the English source phrase. */
const ID: Record<string, string> = {
  'Antigravity Accounts': 'Akun Antigravity',
  'Switch the live agy credential, save accounts, and watch plan quota.': 'Ganti kredensial agy yang aktif, simpan akun, dan pantau kuota paket.',
  'Refresh accounts and quota': 'Muat ulang akun dan kuota',
  'Rotating…': 'Memutar…',
  'Rotate quota': 'Putar kuota',
  'Save current': 'Simpan aktif',
  'Sign in': 'Masuk',
  'Updated {time}': 'Diperbarui {time}',
  'Dismiss notice': 'Tutup pemberitahuan',
  'Sign-in is waiting for the authorization code.': 'Proses masuk menunggu kode otorisasi.',
  'Finish it before the sign-in window closes.': 'Selesaikan sebelum jendela masuk ditutup.',
  'Resume sign-in': 'Lanjutkan masuk',
  'agy is signed in as {name}, but the account is not stored.': 'agy masuk sebagai {name}, tetapi akun itu belum disimpan.',
  'Save it to switch back to it later.': 'Simpan agar bisa dipilih lagi nanti.',
  'Save it': 'Simpan',
  'Detailed quota groups are unavailable: {message}': 'Rincian grup kuota tidak tersedia: {message}',
  'Reading accounts and quota…': 'Membaca akun dan kuota…',
  'The Harness Host did not answer': 'Harness Host tidak merespons',
  'The Antigravity API is unreachable.': 'API Antigravity tidak dapat dijangkau.',
  'Try again': 'Coba lagi',
  'The agy-auth CLI is not available': 'CLI agy-auth tidak tersedia',
  'Could not run {binary}.': 'Tidak bisa menjalankan {binary}.',
  'Install it with npm install -g @fikrilal/agy-auth and make sure it is on PATH.': 'Pasang dengan npm install -g @fikrilal/agy-auth dan pastikan ada di PATH.',
  'Retry': 'Coba lagi',
  'agy-auth could not read the accounts': 'agy-auth tidak bisa membaca daftar akun',
  'No Antigravity accounts yet': 'Belum ada akun Antigravity',
  'Sign in with Google to add one, or save the account agy is already using.': 'Masuk dengan Google untuk menambah akun, atau simpan akun yang sedang dipakai agy.',
  'Save current agy account': 'Simpan akun agy saat ini',
  'agy-auth stores an encrypted snapshot and switches the live credential. Restart agy after switching.': 'agy-auth menyimpan snapshot terenkripsi dan mengganti kredensial aktif. Jalankan ulang agy setelah berganti.',
  'Stored accounts': 'Akun tersimpan',
  '{count} stored accounts': '{count} akun tersimpan',
  '1 stored account': '1 akun tersimpan',
  'Resets {time}': 'Reset {time}',
  'Reset time unavailable': 'Waktu reset tidak tersedia',
  'Active': 'Aktif',
  'Token expired': 'Token kedaluwarsa',
  'Not stored': 'Belum disimpan',
  'In use': 'Sedang dipakai',
  'Switch': 'Ganti',
  'Switching…': 'Mengganti…',
  'No email in credential': 'Tidak ada email di kredensial',
  'added {time}': 'ditambahkan {time}',
  'last used {time}': 'terakhir dipakai {time}',
  'All models · 5-hour': 'Semua model · 5 jam',
  'All models · weekly': 'Semua model · mingguan',
  'Quota unavailable ({message}).': 'Kuota tidak tersedia ({message}).',
  'Storage and credential health': 'Kesehatan penyimpanan dan kredensial',
  'Snapshots and backups live under the agy-auth registry. Back up the encryption key separately.': 'Snapshot dan cadangan ada di registry agy-auth. Cadangkan encryption key secara terpisah.',
  'Keyring available': 'Keyring tersedia',
  'File storage only': 'Hanya penyimpanan file',
  'Clean storage…': 'Bersihkan penyimpanan…',
  'Storage status unavailable: {message}': 'Status penyimpanan tidak tersedia: {message}',
  'Registry': 'Registry',
  'Accounts': 'Akun',
  'Token file': 'File token',
  'Encryption key': 'Encryption key',
  'Keyring': 'Keyring',
  'Credential mirror': 'Mirror kredensial',
  'agy processes': 'Proses agy',
  'Antigravity Desktop': 'Antigravity Desktop',
  'CLI': 'CLI',
  'not running': 'tidak berjalan',
  '{count} running': '{count} berjalan',
  'unknown': 'tidak diketahui',
  'Quota grouped by model family: Gemini, Claude/GPT, and Argon when available.': 'Kuota dikelompokkan per keluarga model: Gemini, Claude/GPT, dan Argon bila tersedia.',
  'Plugin UI for Google Antigravity CLI accounts. Not affiliated with Google.': 'UI plugin untuk akun Google Antigravity CLI. Tidak berafiliasi dengan Google.',
  'Switch to Indonesian': 'Ganti ke Bahasa Indonesia',
  'Switch to English': 'Ganti ke Bahasa Inggris',
  'Language': 'Bahasa',
  'Clean storage': 'Bersihkan penyimpanan',
  'Clean up managed backups and orphan snapshots?': 'Bersihkan cadangan terkelola dan snapshot yatim?',
  'This removes files that agy-auth manages beyond its retention policy.': 'Tindakan ini menghapus file yang dikelola agy-auth di luar kebijakan retensinya.',
  'Clean': 'Bersihkan',
  'Cancel': 'Batal',
  'Close': 'Tutup',
  'Save': 'Simpan',
  'Remove': 'Hapus',
  'Account': 'Akun',
  'Alias': 'Alias',
  'Alias saved.': 'Alias disimpan.',
  'Remove this account?': 'Hapus akun ini?',
  'Remove account': 'Hapus akun',
  'Save current account': 'Simpan akun saat ini',
  'Sign in with Google': 'Masuk dengan Google',
  'Authorization URL': 'URL otorisasi',
  'Open Google': 'Buka Google',
  'Paste the authorization code': 'Tempel kode otorisasi',
  'Finish sign-in': 'Selesaikan masuk',
  'Sign-in cancelled.': 'Proses masuk dibatalkan.',
  'Sign-in failed.': 'Proses masuk gagal.',
  'Waiting for Google…': 'Menunggu Google…',
  'Gemini Models': 'Model Gemini',
  'Claude and GPT models': 'Model Claude dan GPT',
  'Gemini 4 Argon': 'Gemini 4 Argon',
  'Weekly Limit Remaining': 'Sisa batas mingguan',
  'Five Hour Limit Remaining': 'Sisa batas 5 jam',
  'Quota group': 'Grup kuota',
  'Quota': 'Kuota',
  'Edit alias': 'Ubah alias',
  'Edit alias for {name}': 'Ubah alias untuk {name}',
  'Remove {name}': 'Hapus {name}',
  'running': 'berjalan',
  'an unknown account': 'akun yang tidak dikenal',
  'Save the live agy account': 'Simpan akun agy yang aktif',
  'agy-auth reads the credential agy is using now and stores an encrypted snapshot under ~/.config/agy-auth.': 'agy-auth membaca kredensial yang sedang dipakai agy dan menyimpan snapshot terenkripsi di ~/.config/agy-auth.',
  'Save account': 'Simpan akun',
  'Saving…': 'Menyimpan…',
  'Alias (optional)': 'Alias (opsional)',
  'A short alias of up to 32 characters with no spaces. You can set one later.': 'Alias singkat maksimal 32 karakter tanpa spasi. Bisa diatur nanti.',
  'Sign in to Google Antigravity': 'Masuk ke Google Antigravity',
  'Adds a new account through the same OAuth client Antigravity CLI uses. Your current credential is backed up first.': 'Menambah akun baru lewat klien OAuth yang sama dengan Antigravity CLI. Kredensial saat ini dicadangkan lebih dulu.',
  'Google will ask you to approve access. The page then asks for the authorization code shown on antigravity.google/oauth-callback.': 'Google akan meminta persetujuan. Halaman ini lalu meminta kode otorisasi yang tampil di antigravity.google/oauth-callback.',
  'Starting the agy-auth sign-in…': 'Memulai proses masuk agy-auth…',
  'Open the Google sign-in page': 'Buka halaman masuk Google',
  'Waiting for the sign-in URL…': 'Menunggu URL masuk…',
  'Approve access, then copy the authorization code shown on the callback page.': 'Setujui akses, lalu salin kode otorisasi yang tampil di halaman callback.',
  'Paste the code here and submit.': 'Tempel kode di sini lalu kirim.',
  'Authorization code': 'Kode otorisasi',
  'Verifying the code with Google…': 'Memverifikasi kode dengan Google…',
  'Signed in as {name}.': 'Masuk sebagai {name}.',
  'The account is stored and active. Restart agy to use it.': 'Akun tersimpan dan aktif. Jalankan ulang agy untuk memakainya.',
  'The sign-in did not finish. You can try again with the same alias.': 'Proses masuk belum selesai. Coba lagi dengan alias yang sama.',
  'Start sign-in': 'Mulai masuk',
  'Starting…': 'Memulai…',
  'Cancel sign-in': 'Batalkan masuk',
  'Submit code': 'Kirim kode',
  'Verifying…': 'Memverifikasi…',
  'Done': 'Selesai',
  'Alias for {name}': 'Alias untuk {name}',
  'Aliases make switch and remove queries short. Up to 32 characters, no spaces, not a number.': 'Alias mempermudah perintah ganti dan hapus. Maksimal 32 karakter, tanpa spasi, bukan angka.',
  'Clear alias': 'Hapus alias',
  'Save alias': 'Simpan alias',
  'Remove {name}?': 'Hapus {name}?',
  'The encrypted snapshot is deleted. This cannot be undone.': 'Snapshot terenkripsi akan dihapus. Tindakan ini tidak bisa dibatalkan.',
  'This is the active account. The live agy credential is kept unless you also log out.': 'Ini akun aktif. Kredensial agy tetap disimpan kecuali Anda juga keluar.',
  'The live agy credential is not affected.': 'Kredensial agy yang aktif tidak terpengaruh.',
  'Also delete the live agy credential (logout)': 'Hapus juga kredensial agy yang aktif (keluar)',
  'Clean agy-auth storage': 'Bersihkan penyimpanan agy-auth',
  'Prunes managed backups beyond the retention limit and snapshots that no stored account references. Unreferenced snapshots are preserved when the registry is missing.': 'Menghapus cadangan terkelola di luar batas retensi dan snapshot yang tidak dirujuk akun tersimpan. Snapshot tanpa rujukan dipertahankan bila registry tidak ada.',
  'Remove {count} items': 'Hapus {count} item',
  'Nothing to clean.': 'Tidak ada yang perlu dibersihkan.',
  'backup': 'cadangan',
  'orphan snapshot': 'snapshot yatim',
  'The registry is missing, so snapshots were preserved for a rebuild.': 'Registry tidak ada, jadi snapshot dipertahankan untuk pembangunan ulang.',
  'Antigravity activity': 'Aktivitas Antigravity',
  '{count} steps': '{count} langkah',
  '1 step': '1 langkah',
  'Command': 'Perintah',
  'Read': 'Baca',
  'Write': 'Tulis',
  'Edit': 'Ubah',
  'Memory': 'Memori',
  'Task': 'Task',
  'Tool call': 'Pemanggilan tool',
  '1 line': '1 baris',
  '{count} lines': '{count} baris',
  'Command line {line}': 'Baris perintah {line}',
  'Stopped by {signal}': 'Dihentikan oleh {signal}',
  'Exit code {code}': 'Kode keluar {code}',
  'No exit code': 'Tanpa kode keluar',
  'Running': 'Berjalan',
  'Failed': 'Gagal',
  'Copy': 'Salin',
  'Copied': 'Tersalin',
  'No output': 'Tidak ada keluaran',
  'Collapse output': 'Ciutkan keluaran',
  'Collapse': 'Ciutkan',
  'Expand {count} more lines': 'Tampilkan {count} baris lagi',
  '… {count} more lines': '… {count} baris lagi',
  'Truncated': 'Dipangkas',
  'Output was truncated by agy. Full file:': 'Keluaran dipotong oleh agy. File lengkap:',
}

/** Context value. */
interface I18nValue {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const Context = createContext<I18nValue | undefined>(undefined)

/** Read the stored language, defaulting to English. */
function initialLanguage(): Language {
  try {
    return localStorage.getItem('agy-auth.lang') === 'id' ? 'id' : 'en'
  } catch {
    return 'en'
  }
}

/**
 * Provide page copy in the selected language.
 * @param props.children - page tree.
 * @returns provider.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(initialLanguage)
  useEffect(() => {
    try { localStorage.setItem('agy-auth.lang', lang) } catch { /* private mode */ }
  }, [lang])
  const value = useMemo<I18nValue>(() => ({
    lang,
    setLang: setLangState,
    t: (key, vars) => {
      const template = lang === 'id' ? (ID[key] ?? key) : key
      if (vars === undefined) return template
      return template.replace(/\{([^}]+)\}/g, (match, name) => {
        const value = vars[name]
        return value === undefined ? match : String(value)
      })
    },
  }), [lang])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

/**
 * Read the active copy.
 * @returns language, setter, and translator.
 */
export function useI18n(): I18nValue {
  const value = useContext(Context)
  if (value === undefined) throw new Error('useI18n must be rendered inside I18nProvider')
  return value
}