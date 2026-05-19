"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Supabase credentials (Hardcoded agar instan)
const SUPABASE_URL = "https://xibphltzzayddzaltyqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_YwKLp-iU1krV6AwWvAjxvA_rarL3gkT";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

interface CartItem {
  product: Product;
  qty: number;
}

export default function LandingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [customerName, setCustomerName] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [address, setAddress] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [generatedWaUrl, setGeneratedWaUrl] = useState("");

  useEffect(() => {
    const fetchProducts = async () => {
      // Ambil data dari tabel products (id, name, price, stock)
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching products:", error);
      } else {
        setProducts(data || []);
      }
      setLoading(false);
    };

    fetchProducts();
  }, []);

  const formatRupiah = (number: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(number);
  };

  // Tambah ke keranjang
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, qty: Math.min(item.qty + 1, product.stock) } // Maksimal sesuai stok
            : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });

    // Otomatis scroll ke form
    document.getElementById("order-form")?.scrollIntoView({ behavior: "smooth" });
  };

  // Update jumlah item di keranjang
  const updateQty = (id: string, newQty: number, stock: number) => {
    if (newQty < 1) {
      // Hapus dari keranjang jika qty < 1
      setCart((prev) => prev.filter((item) => item.product.id !== id));
    } else {
      const validQty = Math.min(newQty, stock);
      setCart((prev) =>
        prev.map((item) => (item.product.id === id ? { ...item, qty: validQty } : item))
      );
    }
  };

  const total_qty = cart.reduce((acc, item) => acc + item.qty, 0);
  const total_price = cart.reduce((acc, item) => acc + item.product.price * item.qty, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert("Keranjang pesanan masih kosong. Silakan pilih produk terlebih dahulu.");
      return;
    }

    setIsSubmitting(true);

    // Struktur data presisi sesuai model Flutter untuk po_orders
    // Data ini akan dikirimkan via WA ke Admin tanpa insert ke Supabase
    const orderData = {
      customer_name: customerName,
      wa_number: waNumber,
      address: address,
      items: cart.map((item) => ({
        name: item.product.name,
        qty: item.qty,
        price: item.product.price,
      })),
      total_qty,
      total_price,
      payment_status: "unpaid",
      production_status: "pending",
    };

    // Insert ke tabel po_orders
    const { error } = await supabase.from("po_orders").insert([orderData]);

    if (error) {
      alert("Terjadi kesalahan saat menyimpan pesanan: " + error.message);
      setIsSubmitting(false);
      return;
    }

    // ==========================================
    // PENGINGAT: Ganti nomor WA di bawah ini dengan nomor Admin
    const adminPhoneNumber = "628xxxxxxxxxx"; 
    // ==========================================

    const itemsText = cart
      .map((item) => `- ${item.product.name} x${item.qty} = ${formatRupiah(item.product.price * item.qty)}`)
      .join("\n");

    // Pesan WA yang mencakup format JSON agar mudah disalin admin ke aplikasi Flutter
    const waMessage = `Halo Admin, saya mau order:\n- Nama: ${customerName}\n- WA: ${waNumber}\n- Alamat: ${address}\n\n*Pesanan:*\n${itemsText}\n\n*Total Tagihan: ${formatRupiah(total_price)}*\n\n---\n*Format JSON (Salin dan Input ke APK):*\n\`\`\`\n${JSON.stringify(orderData, null, 2)}\n\`\`\``;

    const waUrl = `https://wa.me/${adminPhoneNumber}?text=${encodeURIComponent(waMessage)}`;
    
    setGeneratedWaUrl(waUrl);
    setShowSuccessPopup(true);

    // Reset Form
    setCustomerName("");
    setWaNumber("");
    setAddress("");
    setCart([]);
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 scroll-smooth">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 transition-all border-b border-stone-100">
        <div className="max-w-6xl mx-auto px-6 py-2 flex justify-between items-center">
          <div className="flex items-center">
            <img 
              src="/assets/icons/icon-1.png" 
              alt="Neagable Logo" 
              className="h-14 md:h-16 w-auto object-contain drop-shadow-md hover:scale-105 transition-transform" 
            />
          </div>
          <a href="#order-form" className="bg-rose-500 text-white px-6 py-2.5 rounded-full font-bold text-sm hover:bg-rose-600 hover:shadow-lg hover:shadow-rose-500/40 transition-all active:scale-95">
            Keranjang ({total_qty})
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white pt-24 pb-32">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] brightness-100 contrast-150"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] opacity-40 bg-gradient-to-b from-amber-200 via-orange-200 to-transparent blur-[120px] rounded-full pointer-events-none"></div>
        
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 border border-rose-100 text-rose-600 font-bold text-xs tracking-wide uppercase mb-8 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            Neagable Sweet Treats 🍪
          </div>
          <h2 className="text-5xl md:text-7xl font-black mb-8 leading-[1.1] tracking-tight text-stone-800 font-serif">
            Artisan Pastries <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-400">& Cookies Lumer</span>
          </h2>
          <p className="text-lg md:text-xl mb-10 text-stone-600 max-w-2xl mx-auto leading-relaxed font-medium">
            Pilihan manis buat harimu! Mulai dari brownies lumer, soft cookies, chewy kuki dubai, sampai aneka pastry lezat yang siap menemani waktu santaimu.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="#catalog" className="px-8 py-4 bg-stone-900 text-white rounded-full font-bold text-lg hover:bg-stone-800 transition-all hover:shadow-xl hover:shadow-stone-900/20 active:scale-95">
              Lihat Katalog
            </a>
            <a href="#order-form" className="px-8 py-4 bg-white text-stone-900 border-2 border-stone-200 rounded-full font-bold text-lg hover:border-stone-300 hover:bg-stone-50 transition-all active:scale-95">
              Lihat Keranjang
            </a>
          </div>
        </div>
      </section>

      {/* Catalog Section */}
      <section id="catalog" className="max-w-6xl mx-auto px-3 sm:px-6 py-12 sm:py-24 scroll-mt-20">
        <div className="text-center mb-16">
          <h3 className="text-4xl font-black text-stone-800 mb-4 tracking-tight font-serif">Menu Manisan Kami ✨</h3>
          <p className="text-lg text-stone-500 max-w-xl mx-auto font-medium">Pilih dessert favoritmu di bawah ini. Mumpung masih hangat dan fresh dari oven!</p>
        </div>
        
        {loading ? (
          <div className="flex flex-col justify-center items-center h-64 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-amber-700 border-l-4 border-l-transparent border-r-4 border-r-transparent"></div>
            <p className="text-stone-500 font-bold animate-pulse tracking-wide">Memuat produk...</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-8">
            {products.map((product) => (
              <div key={product.id} className="group bg-white rounded-xl sm:rounded-3xl shadow-sm border border-stone-200 overflow-hidden hover:shadow-2xl hover:shadow-rose-500/10 hover:-translate-y-1 sm:hover:-translate-y-2 transition-all duration-300 flex flex-col">
                <div className="h-24 sm:h-48 md:h-64 bg-stone-50 flex items-center justify-center relative overflow-hidden border-b border-stone-100">
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-50/50 to-rose-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="text-4xl sm:text-6xl md:text-8xl transform group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 drop-shadow-md">🍪</span>
                  
                  {product.stock === 0 && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-10">
                      <span className="bg-red-500 text-white px-2 py-1 sm:px-6 sm:py-2 rounded-full font-black shadow-lg sm:shadow-xl shadow-red-500/40 transform -rotate-12 text-[8px] sm:text-sm md:text-xl border-2 sm:border-4 border-white tracking-widest sm:tracking-wider">
                        HABIS
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-2 sm:p-6 md:p-8 flex-grow flex flex-col justify-between bg-white">
                  <div>
                    <h4 className="text-[10px] sm:text-lg md:text-2xl font-bold text-stone-900 mb-1 sm:mb-2 leading-tight group-hover:text-rose-500 transition-colors line-clamp-2">{product.name}</h4>
                    <p className="text-[10px] sm:text-xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500 mb-2 sm:mb-6">
                      {formatRupiah(product.price)}
                    </p>
                  </div>
                  <div className="mt-auto">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 sm:mb-5 gap-1 sm:gap-0">
                      <span className="text-[8px] sm:text-sm font-bold text-stone-400 uppercase tracking-wider hidden sm:block">Ketersediaan</span>
                      <span className={`text-[8px] sm:text-sm font-black px-1.5 py-0.5 sm:px-4 sm:py-1.5 rounded-full ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {product.stock > 0 ? <><span className="hidden sm:inline">{product.stock} TERSISA</span><span className="sm:hidden">{product.stock} pcs</span></> : 'KOSONG'}
                      </span>
                    </div>
                    <button 
                      onClick={() => addToCart(product)}
                      disabled={product.stock === 0}
                      className={`w-full py-1.5 sm:py-4 rounded-lg sm:rounded-2xl font-bold transition-all active:scale-95 text-[10px] sm:text-sm md:text-lg flex justify-center items-center gap-1 sm:gap-2 ${
                        product.stock === 0 
                        ? 'bg-stone-100 text-stone-400 cursor-not-allowed' 
                        : 'bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white hover:shadow-lg hover:shadow-rose-500/30'
                      }`}
                    >
                      {product.stock === 0 ? 'Habis' : <><span className="hidden sm:inline">+ Keranjang</span><span className="sm:hidden">+ Beli</span></>}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Order Form Section */}
      <section id="order-form" className="bg-[#4a2c2a] py-24 px-6 relative overflow-hidden scroll-mt-10">
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/3 w-[800px] h-[800px] bg-gradient-to-bl from-pink-500/20 to-rose-500/20 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/3 w-[600px] h-[600px] bg-gradient-to-tr from-rose-500/20 to-pink-500/20 blur-[100px] rounded-full pointer-events-none"></div>
        
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <h3 className="text-4xl font-black text-white mb-4 tracking-tight font-serif">Pesan Manisanmu 💌</h3>
            <p className="text-rose-200 text-lg font-medium max-w-2xl mx-auto">
              Lengkapi data di bawah ini. Pesanan Anda akan kami simpan dan diteruskan ke WhatsApp Admin.
            </p>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-stone-100/10">
            <div className="p-8 md:p-12">
              <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* Informasi Pembeli */}
                <div className="space-y-6">
                  <h4 className="text-xl font-black text-stone-900 border-b-2 border-stone-100 pb-3 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-sm">1</span>
                    Informasi Pelanggan
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-stone-700 mb-2">Nama Lengkap</label>
                      <input 
                        type="text" 
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full px-5 py-4 rounded-2xl border-2 border-stone-100 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all text-stone-900 bg-stone-50 focus:bg-white font-medium"
                        placeholder="Contoh: Budi Santoso"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-stone-700 mb-2">Nomor WhatsApp</label>
                      <input 
                        type="tel" 
                        required
                        value={waNumber}
                        onChange={(e) => setWaNumber(e.target.value)}
                        className="w-full px-5 py-4 rounded-2xl border-2 border-stone-100 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all text-stone-900 bg-stone-50 focus:bg-white font-medium"
                        placeholder="Contoh: 08123456789"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-stone-700 mb-2">Alamat Pengiriman</label>
                    <textarea 
                      required
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-5 py-4 rounded-2xl border-2 border-stone-100 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all text-stone-900 bg-stone-50 focus:bg-white resize-none font-medium"
                      placeholder="Masukkan alamat lengkap (Jalan, RT/RW, Kelurahan, Kecamatan, Kota)"
                    />
                  </div>
                </div>

                {/* Detail Pesanan Keranjang */}
                <div className="space-y-6 pt-4">
                  <div className="flex justify-between items-center border-b-2 border-stone-100 pb-3">
                    <h4 className="text-xl font-black text-stone-900 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-sm">2</span>
                      Keranjang Pesanan
                    </h4>
                  </div>

                  {cart.length === 0 ? (
                    <div className="text-center py-10 bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200">
                      <p className="text-stone-500 font-medium mb-3">Keranjang masih kosong.</p>
                      <a href="#catalog" className="inline-block bg-white border border-stone-200 px-6 py-2 rounded-full text-amber-700 font-bold hover:bg-stone-100 transition-colors shadow-sm">
                        + Tambah Produk dari Katalog
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map((item) => (
                        <div key={item.product.id} className="flex flex-col sm:flex-row justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-100 gap-4">
                          <div className="flex-1 w-full">
                            <h5 className="font-bold text-stone-800">{item.product.name}</h5>
                            <p className="text-amber-600 font-black">{formatRupiah(item.product.price)}</p>
                          </div>
                          
                          {/* Kontrol Qty */}
                          <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-sm border border-stone-200">
                            <button 
                              type="button" 
                              onClick={() => updateQty(item.product.id, item.qty - 1, item.product.stock)} 
                              className="w-10 h-10 flex items-center justify-center font-bold text-stone-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              −
                            </button>
                            <span className="font-black text-stone-800 w-10 text-center">{item.qty}</span>
                            <button 
                              type="button" 
                              onClick={() => updateQty(item.product.id, item.qty + 1, item.product.stock)} 
                              disabled={item.qty >= item.product.stock} 
                              className="w-10 h-10 flex items-center justify-center font-bold text-stone-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              +
                            </button>
                          </div>
                          
                          <div className="text-right sm:w-32 hidden sm:block">
                            <p className="text-xs text-stone-500 font-medium uppercase mb-1">Subtotal</p>
                            <p className="font-black text-stone-800">{formatRupiah(item.product.price * item.qty)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dropdown Tambah Cepat */}
                  <div className="pt-4">
                    <select 
                      value=""
                      onChange={(e) => {
                        const product = products.find(p => p.id === e.target.value);
                        if (product) addToCart(product);
                      }}
                      className="w-full px-5 py-4 rounded-2xl border-2 border-stone-100 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all text-stone-600 bg-white font-bold cursor-pointer"
                    >
                      <option value="" disabled>-- Klik untuk tambah produk lain ke keranjang --</option>
                      {products.filter(p => p.stock > 0 && !cart.find(c => c.product.id === p.id)).map(p => (
                        <option key={p.id} value={p.id}>{p.name} - {formatRupiah(p.price)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Total Ringkasan */}
                {cart.length > 0 && (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-6 rounded-3xl flex flex-col border-2 border-amber-100 gap-4 mt-8 shadow-inner">
                    <div className="flex flex-col sm:flex-row justify-between items-center w-full">
                      <span className="text-stone-600 font-bold text-lg uppercase tracking-wide">Total Pembayaran</span>
                      <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-700 to-orange-600">
                        {formatRupiah(total_price)}
                      </span>
                    </div>
                    <div className="bg-amber-100/50 p-3 rounded-xl border border-amber-200 mt-2 flex gap-3 items-start">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm text-amber-800 font-medium">
                        <span className="font-bold">Catatan:</span> Nominal rupiah belakang pada total pembayaran bisa berubah 1-99 rupiah saat proses pembayaran dikarenakan *generate* sistem QRIS.
                      </p>
                    </div>
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={isSubmitting || cart.length === 0}
                  className={`w-full py-5 rounded-2xl font-black text-xl text-white shadow-xl transition-all duration-300 flex items-center justify-center gap-3 mt-4 ${
                    isSubmitting || cart.length === 0 
                    ? 'bg-stone-300 shadow-none cursor-not-allowed text-stone-500' 
                    : 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 hover:-translate-y-1 hover:shadow-rose-500/40 active:scale-[0.98]'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-6 w-6 border-t-4 border-b-4 border-white border-l-4 border-l-transparent border-r-4 border-r-transparent"></div>
                      Memproses Pesanan...
                    </>
                  ) : (
                    <>
                      Kirim Pesanan Sekarang
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Success Popup Modal */}
      {showSuccessPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={() => setShowSuccessPopup(false)}></div>
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-gradient-to-br from-green-400 to-emerald-500 h-32 flex items-center justify-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg transform translate-y-8">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <div className="pt-12 pb-8 px-8 text-center">
              <h3 className="text-2xl font-black text-stone-800 mb-2 font-serif">Pesanan Berhasil! 🎉</h3>
              <p className="text-stone-500 font-medium mb-8 leading-relaxed">
                Terima kasih telah memesan. Silakan hubungi admin kami via WhatsApp untuk menanyakan pesanan dan instruksi pembayaran.
              </p>
              
              <a 
                href={generatedWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowSuccessPopup(false)}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white shadow-xl bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 hover:-translate-y-1 hover:shadow-green-500/40 active:scale-95 transition-all mb-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
                </svg>
                Hubungi Admin di WhatsApp
              </a>
              <button 
                onClick={() => setShowSuccessPopup(false)}
                className="w-full py-3 rounded-xl font-bold text-stone-500 hover:bg-stone-100 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-stone-950 text-stone-400 py-12 text-center border-t border-stone-800">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-center gap-3 mb-6 opacity-50">
            <img 
              src="/assets/icons/icon-1.png" 
              alt="Neagable Logo" 
              className="w-10 h-10 object-contain grayscale" 
            />
            <h2 className="text-2xl font-black text-white tracking-tight">Neagable</h2>
          </div>
          <p className="font-medium text-sm">&copy; {new Date().getFullYear()} Neagable Landing Page. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
