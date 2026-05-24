export const metadata = {
  title: "Kebijakan Privasi - Naegable",
  description: "Penjelasan penggunaan data pribadi pelanggan Naegable.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#fff7ec] px-4 py-12 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-3xl border border-[#442f2a]/10 bg-white p-6 sm:p-10 shadow-sm">
        <h1 className="mb-2 text-3xl font-black text-[#442f2a] sm:text-4xl">
          Kebijakan Privasi
        </h1>
        <p className="mb-8 text-sm font-medium text-[#442f2a]/60">
          Berlaku sejak: 24 Mei 2026
        </p>

        <div className="space-y-6 text-sm leading-relaxed text-[#442f2a]/80 sm:text-base">
          <section>
            <h2 className="mb-2 text-lg font-black text-[#442f2a]">
              Data yang Kami Kumpulkan
            </h2>
            <p>
              Kami hanya mengumpulkan data minimum yang dibutuhkan untuk
              memproses pesanan: nama lengkap, nomor WhatsApp, alamat pengiriman,
              detail pesanan, serta catatan tambahan (jika diisi).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-black text-[#442f2a]">
              Tujuan Penggunaan Data
            </h2>
            <p>
              Data digunakan untuk verifikasi pesanan, komunikasi terkait status
              order, pengiriman pesanan, serta keperluan pencatatan operasional
              toko.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-black text-[#442f2a]">
              Perlindungan Data
            </h2>
            <p>
              Nomor WhatsApp diproses dengan mekanisme enkripsi di database dan
              akses data dibatasi menggunakan Row Level Security (RLS).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-black text-[#442f2a]">
              Retensi Data
            </h2>
            <p>
              Data disimpan hanya selama dibutuhkan untuk pemrosesan pesanan dan
              kewajiban pencatatan internal, lalu akan dihapus atau dianonimkan
              secara berkala.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-black text-[#442f2a]">
              Hak Pelanggan
            </h2>
            <p>
              Anda dapat meminta koreksi atau penghapusan data pesanan melalui
              kontak admin Naegable.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
