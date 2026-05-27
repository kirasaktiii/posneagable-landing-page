"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { formatWIB } from "@/lib/datetime";
import { supabaseClient } from "@/lib/supabase/client";

interface Category {
  id: string;
  name: string;
}

interface ProductCategory {
  name: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  is_active?: boolean;
  image_url?: string | null;
  category_id?: string | null;
  categories?: ProductCategory | ProductCategory[] | null;
}

interface CartItem {
  product: Product;
  qty: number;
}

interface OrderResult {
  id: string;
  customer_name: string;
  wa_number: string;
  address: string;
  notes?: string;
  items: { name: string; qty: number; price: number }[];
  total_qty: number;
  total_price: number;
  qris_fee?: number;
  unique_code?: number;
  payment_status: string;
  production_status: string;
  delivery_method: string;
  created_at: string | null;
  updated_at?: string | null;
}

interface CreateOrderResponse {
  order?: OrderResult;
  error?: string;
}

interface DeliverySetting {
  method: string;
  is_active: boolean;
}

export default function LandingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [deliverySettings, setDeliverySettings] = useState<Record<string, boolean>>({
    do: true,
    cod: true,
    pickup: true,
  });
  const [loading, setLoading] = useState(true);

  // Form State
  const [customerName, setCustomerName] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [generatedWaUrl, setGeneratedWaUrl] = useState("");
  const [latestOrderCreatedAt, setLatestOrderCreatedAt] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<"do" | "cod" | "pickup">("do");
  const [selectedCategory, setSelectedCategory] = useState("Semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Order Lookup State
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<OrderResult[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // Ambil categories
      const { data: catData } = await supabaseClient
        .from("categories")
        .select("id, name")
        .order("name", { ascending: true });

      if (catData) setCategories(catData);

      // Ambil products dengan relasi ke categories
      const { data, error } = await supabaseClient
        .from("products")
        .select("id, name, price, stock, is_active, image_url, category_id, categories(name)")
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching products:", error);
      } else {
        setProducts((data as Product[]) || []);
      }

      // Ambil delivery settings
      const { data: deliveryData, error: deliveryError } = await supabaseClient
        .from("delivery_settings")
        .select("method, is_active");

      if (!deliveryError && deliveryData) {
        const settingsMap: Record<string, boolean> = {};
        deliveryData.forEach((setting: DeliverySetting) => {
          settingsMap[setting.method] = setting.is_active;
        });
        setDeliverySettings((prev) => ({ ...prev, ...settingsMap }));

        // Jika metode "do" tidak aktif, pindah ke metode pertama yang aktif
        if (settingsMap["do"] === false) {
          const activeMethods = ["do", "cod", "pickup"].filter((m) => settingsMap[m] !== false);
          if (activeMethods.length > 0) {
            setDeliveryMethod(activeMethods[0] as "do" | "cod" | "pickup");
          }
        }
      }

      setLoading(false);
    };

    fetchData();
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
    setLatestOrderCreatedAt(null);

    // Persist through Next.js API so server owns UTC timestamp creation/serialization.
    const orderData = {
      customer_name: customerName,
      wa_number: waNumber,
      address: address,
      notes: notes,
      items: cart.map((item) => ({
        name: item.product.name,
        qty: item.qty,
        price: item.product.price,
      })),
      total_qty,
      total_price: total_price + 500,
      qris_fee: 500,
      unique_code: 0, // akan di-generate saat pembayaran QRIS di app
      delivery_method: deliveryMethod,
      payment_status: "unpaid",
      production_status: "pending",
    };

    let createOrderResponse: Response;
    try {
      createOrderResponse = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
      });
    } catch (error) {
      console.error("Create order failed:", error);
      alert("Terjadi kesalahan saat menyimpan pesanan. Coba lagi.");
      setIsSubmitting(false);
      return;
    }

    const createOrderPayload = (await createOrderResponse
      .json()
      .catch(() => null)) as CreateOrderResponse | null;

    if (!createOrderResponse.ok) {
      alert(
        "Terjadi kesalahan saat menyimpan pesanan: " +
          (createOrderPayload?.error ?? "Unknown error")
      );
      setIsSubmitting(false);
      return;
    }

    const createdAtUtc = createOrderPayload?.order?.created_at ?? null;
    const createdAtWIB = createdAtUtc ? `${formatWIB(createdAtUtc)} WIB` : "-";
    setLatestOrderCreatedAt(createdAtUtc);

    // ==========================================
    // PENGINGAT: Ganti nomor WA di bawah ini dengan nomor Admin
    const adminPhoneNumber = "6281336994747";
    // ==========================================

    const itemsText = cart
      .map((item) => `- ${item.product.name} x${item.qty} = ${formatRupiah(item.product.price * item.qty)}`)
      .join("\n");

    const deliveryText = deliveryMethod === "do"
      ? "DO (Delivery Order - pengiriman via kurir)"
      : deliveryMethod === "cod"
        ? "COD (Ketemu di Alun-Alun Mojokerto)"
        : "Pick Up (Ambil di Tempat)";

    const waMessage = `Halo Admin, saya mau order & minta barcode QRIS:\n- Nama: ${customerName}\n- WA: ${waNumber}\n- Alamat: ${address}\n- Metode: ${deliveryText}\n- Waktu Order: ${createdAtWIB}${notes ? `\n- Catatan: ${notes}` : ""}\n\n*Pesanan:*\n${itemsText}\n\n*Biaya Layanan/QRIS: ${formatRupiah(500)}*\n*Total Tagihan: ${formatRupiah(total_price + 500)}*\n\nMohon kirimkan barcode QRIS untuk pembayaran. Terima kasih.`;

    const waUrl = `https://wa.me/${adminPhoneNumber}?text=${encodeURIComponent(waMessage)}`;

    setGeneratedWaUrl(waUrl);
    setShowSuccessPopup(true);

    // Reset Form
    setCustomerName("");
    setWaNumber("");
    setAddress("");
    setNotes("");
    setCart([]);
    setDeliveryMethod("do");
    setIsSubmitting(false);
  };

  // Order Lookup
  const handleLookup = async () => {
    if (!lookupQuery.trim()) return;
    setIsLookingUp(true);
    setHasSearched(true);

    const query = lookupQuery.trim();

    try {
      const lookupResponse = await fetch(
        `/api/orders?query=${encodeURIComponent(query)}`,
        { method: "GET", cache: "no-store" }
      );

      if (!lookupResponse.ok) {
        setLookupResults([]);
      } else {
        const payload = (await lookupResponse.json()) as { orders?: OrderResult[] };
        setLookupResults(payload.orders || []);
      }
    } catch (err) {
      console.error("Lookup error:", err);
      setLookupResults([]);
    }
    setIsLookingUp(false);
  };

  return (
    <div className="min-h-screen bg-[#fff7ec] font-sans text-[#442f2a] scroll-smooth">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 transition-all border-b border-[#442f2a]/10">
        <div className="bg-[#f5cbd7] text-[#442f2a] text-[10px] sm:text-xs py-1.5 px-4 text-center w-full font-medium tracking-wide shadow-sm flex flex-col sm:flex-row items-center justify-center gap-0 sm:gap-1.5">
          <span><span className="animate-pulse mr-1"></span><strong>Operational hours:</strong> Senin-Jumat, 09.00 - 14.00 WIB</span>
          <span className="opacity-80 text-[9px] sm:text-[11px] mt-0.5 sm:mt-0">(Pemesanan diluar jam operasional akan diproses di hari berikutnya.)</span>
        </div>
        <div className="max-w-6xl mx-auto px-6 py-2 flex justify-between items-center">
          <div className="flex items-center">
            <img
              src="/assets/icons/icon-1.png"
              alt="Naegablé Logo"
              className="h-14 md:h-16 w-auto object-contain drop-shadow-md hover:scale-105 transition-transform"
            />
          </div>
          <button onClick={() => document.getElementById("order-form")?.scrollIntoView({ behavior: "smooth" })} className="relative bg-[#f5cbd7] text-[#442f2a] p-2.5 rounded-xl hover:bg-[#eeb1c3] border border-[#442f2a] shadow-sm transition-all active:scale-95">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {total_qty > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#442f2a] text-[#fff7ec] text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-md">
                {total_qty}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-[#f3a0aa]/30 pt-24 pb-32">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] brightness-100 contrast-150"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] opacity-40 bg-gradient-to-b from-amber-200 via-orange-200 to-transparent blur-[120px] rounded-full pointer-events-none"></div>

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#f5cbd7]/30 border border-[#442f2a]/20 text-[#442f2a] font-bold text-xs tracking-wide uppercase mb-8 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#f5cbd7]"></span>
            </span>
            Naegablé Sweet Treats 🍪
          </div>
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-black mb-6 sm:mb-8 leading-[1.1] tracking-tight text-[#442f2a] font-serif">
            Soft Baked Cookies <br className="hidden sm:block" /> <span className="text-[#f790b2] drop-shadow-sm">& Dessert</span>
          </h2>
          <p className="text-base sm:text-lg md:text-xl mb-8 sm:mb-10 text-[#442f2a]/80 max-w-2xl mx-auto leading-relaxed font-medium px-2 capitalize">
            Made by order & freshly baked
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })} className="px-6 py-3 bg-[#442f2a] text-[#fff7ec] rounded-full font-bold text-base hover:bg-[#2e1d1a] transition-all hover:shadow-lg active:scale-95">
              Lihat Katalog
            </button>
            <button onClick={() => document.getElementById("order-form")?.scrollIntoView({ behavior: "smooth" })} className="px-6 py-3 bg-transparent text-[#442f2a] border border-[#442f2a] rounded-full font-bold text-base hover:bg-[#f5cbd7] transition-all active:scale-95">
              Lihat Keranjang
            </button>
          </div>
        </div>
      </section>

      {/* Catalog Section */}
      <section id="catalog" className="max-w-6xl mx-auto px-3 sm:px-6 py-12 sm:py-24 scroll-mt-20">
        <div className="text-center mb-10">
          <h3 className="text-4xl font-black text-[#442f2a] mb-4 tracking-tight font-serif">Our Menu!!</h3>
          <p className="text-lg text-[#442f2a]/60 max-w-xl mx-auto font-medium">Pilih dessert favoritmu di bawah ini</p>
        </div>

        {/* Category Filter & Search */}
        <div className="mb-8 sm:mb-12">
          <div className="flex items-center justify-between gap-3 mb-0">
            {/* Category Tabs */}
            <div className="flex-1 overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 pb-2">
                {["Semua", ...categories.map(c => c.name)].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all active:scale-95 border ${selectedCategory === cat
                        ? "bg-[#442f2a] text-[#fff7ec] border-[#442f2a] shadow-md"
                        : "bg-white text-[#442f2a]/70 border-[#442f2a]/15 hover:bg-[#f5cbd7]/40 hover:border-[#442f2a]/30"
                      }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Toggle Button */}
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(!isSearchOpen);
                if (!isSearchOpen) {
                  setTimeout(() => searchInputRef.current?.focus(), 300);
                } else {
                  setSearchQuery("");
                }
              }}
              className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all active:scale-95 border ${isSearchOpen
                  ? "bg-[#442f2a] text-[#fff7ec] border-[#442f2a] shadow-md"
                  : "bg-white text-[#442f2a]/60 border-[#442f2a]/15 hover:bg-[#f5cbd7]/40 hover:border-[#442f2a]/30"
                }`}
              title="Cari produk"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>

          {/* Search Input - Animated */}
          {isSearchOpen && (
            <div className="mt-3 animate-[slideDown_0.3s_ease-out]">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#442f2a]/40">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama produk..."
                  className="w-full pl-12 pr-10 py-3 rounded-xl border-2 border-[#442f2a]/10 hover:border-[#442f2a]/20 focus:border-[#442f2a] focus:ring-4 focus:ring-[#442f2a]/10 outline-none transition-all text-[#442f2a] bg-white font-medium placeholder:text-[#442f2a]/40 text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#442f2a]/40 hover:text-[#442f2a] transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col justify-center items-center h-64 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-amber-700 border-l-4 border-l-transparent border-r-4 border-r-transparent"></div>
            <p className="text-[#442f2a]/60 font-bold animate-pulse tracking-wide">Memuat produk...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-8">
            {products
              .filter((product) => {
                const productCategoryName = Array.isArray(product.categories)
                  ? (product.categories[0]?.name ?? "Lainnya")
                  : (product.categories?.name ?? "Lainnya");
                const matchCategory = selectedCategory === "Semua" || productCategoryName === selectedCategory;
                const matchSearch = searchQuery === "" || product.name.toLowerCase().includes(searchQuery.toLowerCase());
                return matchCategory && matchSearch;
              })
              .map((product) => {
                const isSelected = cart.some(item => item.product.id === product.id);
                return (
                  <div key={product.id} className={`group bg-white rounded-2xl sm:rounded-3xl shadow-sm border ${isSelected ? 'border-[#442f2a] ring-2 ring-[#442f2a]/30 shadow-[#f5cbd7]/30' : 'border-[#442f2a]/20'} overflow-hidden hover:shadow-2xl hover:shadow-[#f5cbd7]/20 hover:-translate-y-1 sm:hover:-translate-y-2 transition-all duration-300 flex flex-col relative`}>
                    {isSelected && (
                      <div className="absolute top-2 right-2 z-20 bg-[#f5cbd7] text-white text-xs font-bold px-2 py-1 rounded-full shadow-md">
                        Terpilih
                      </div>
                    )}
                    <div className="aspect-square w-full bg-[#fff7ec] flex items-center justify-center relative overflow-hidden border-b border-[#442f2a]/10 p-2 sm:p-4">
                      <div className="absolute inset-0 bg-gradient-to-br from-pink-50/50 to-[#fff7ec] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          sizes="(max-width: 768px) 50vw, 33vw"
                          className="object-contain transform group-hover:scale-110 transition-transform duration-500"
                        />
                      ) : (
                        <span className="text-5xl sm:text-6xl md:text-8xl transform group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 drop-shadow-md">🍪</span>
                      )}

                      {product.is_active === false ? (
                        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-10">
                          <span className="bg-stone-500 text-white px-3 py-1.5 sm:px-6 sm:py-2 rounded-full font-black shadow-lg sm:shadow-xl shadow-stone-500/40 transform -rotate-12 text-xs sm:text-sm md:text-xl border-2 sm:border-4 border-white tracking-widest sm:tracking-wider">
                            NOT AVAILABLE
                          </span>
                        </div>
                      ) : product.stock === 0 ? (
                        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-10">
                          <span className="bg-red-500 text-white px-3 py-1.5 sm:px-6 sm:py-2 rounded-full font-black shadow-lg sm:shadow-xl shadow-red-500/40 transform -rotate-12 text-xs sm:text-sm md:text-xl border-2 sm:border-4 border-white tracking-widest sm:tracking-wider">
                            HABIS
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="p-3 sm:p-6 md:p-8 flex-grow flex flex-col justify-between bg-white">
                      <div>
                        <h4 className="text-sm sm:text-lg md:text-2xl font-bold text-[#442f2a] mb-1 sm:mb-2 leading-tight group-hover:text-[#442f2a] transition-colors line-clamp-2">{product.name}</h4>
                        <p className="text-sm sm:text-xl md:text-3xl font-black text-[#442f2a] mb-3 sm:mb-6">
                          {formatRupiah(product.price)}
                        </p>
                      </div>
                      <div className="mt-auto">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 sm:mb-5 gap-2 sm:gap-0">
                          <span className="text-xs sm:text-sm font-bold text-[#442f2a]/40 uppercase tracking-wider hidden sm:block">Ketersediaan</span>
                          <span className={`text-[10px] sm:text-sm font-black px-2 py-1 sm:px-4 sm:py-1.5 rounded-full ${product.is_active === false ? 'bg-stone-200 text-stone-600' : product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {product.is_active === false ? 'NOT AVAILABLE' : product.stock > 0 ? <><span className="hidden sm:inline">{product.stock} TERSISA</span><span className="sm:hidden">{product.stock} pcs</span></> : 'KOSONG'}
                          </span>
                        </div>
                        <button
                          onClick={() => addToCart(product)}
                          disabled={product.stock === 0 || product.is_active === false}
                          className={`w-full px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl sm:rounded-2xl transition-all active:scale-95 text-xs sm:text-sm md:text-base flex justify-center items-center gap-1 sm:gap-2 border ${(product.stock === 0 || product.is_active === false)
                              ? 'bg-[#fff7ec]/80 text-[#442f2a]/40 border-[#442f2a]/10 cursor-not-allowed'
                              : isSelected
                                ? 'bg-[#f5cbd7] text-[#442f2a] font-semibold border-[#442f2a] ring-1 ring-[#442f2a] shadow-sm'
                                : 'bg-transparent text-[#442f2a] border-[#442f2a]/20 hover:bg-[#f5cbd7] hover:border-[#442f2a]'
                            }`}
                        >
                          {product.is_active === false ? 'Not Available' : product.stock === 0 ? 'Habis' : isSelected ? '✓ Terpilih' : '+ Tambah'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </section>

      {/* Order Form Section */}
      <section id="order-form" className="bg-gradient-to-b from-[#fff7ec] to-[#fff7ec] py-24 px-4 sm:px-6 relative overflow-hidden scroll-mt-10">
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/3 w-[600px] sm:w-[800px] h-[600px] sm:h-[800px] bg-gradient-to-bl from-pink-300/20 to-rose-300/20 blur-[100px] sm:blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/3 w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] bg-gradient-to-tr from-rose-300/20 to-pink-300/20 blur-[80px] sm:blur-[100px] rounded-full pointer-events-none"></div>

        <div className="max-w-4xl mx-auto relative z-10">
          <div className="text-center mb-12 sm:mb-16">
            <span className="inline-block py-1.5 px-4 rounded-full bg-white border border-[#442f2a]/20 text-[#442f2a] text-xs sm:text-sm font-bold tracking-widest uppercase mb-4 shadow-sm">
              Checkout
            </span>
            <h3 className="text-4xl sm:text-5xl font-black text-[#442f2a] mb-4 sm:mb-6 tracking-tight font-serif">Pesan Manisanmu 💌</h3>
            <p className="text-[#442f2a]/60 text-base sm:text-lg font-medium max-w-2xl mx-auto px-4">
              Lengkapi data di bawah ini. Pesanan Anda akan kami simpan dan diteruskan langsung ke WhatsApp Admin kami.
            </p>
          </div>

          <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] sm:rounded-[3rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden border border-white p-2 sm:p-3">
            <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] p-6 sm:p-10 md:p-12 shadow-sm border border-stone-50">
              <form onSubmit={handleSubmit} className="space-y-10 sm:space-y-12">

                {/* Informasi Pembeli */}
                <div className="space-y-6 sm:space-y-8">
                  <div className="flex items-center gap-4 border-b border-[#442f2a]/10 pb-4">
                    <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-[#f5cbd7]/40">1</span>
                    <h4 className="text-xl sm:text-2xl font-black text-[#442f2a] tracking-tight">
                      Informasi Pelanggan
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[#442f2a]/80 pl-1">Nama Lengkap</label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full px-5 py-4 rounded-2xl border-2 border-[#442f2a]/10 hover:border-[#442f2a]/20 focus:border-[#442f2a] focus:ring-4 focus:ring-[#442f2a]/10 outline-none transition-all text-[#442f2a] bg-[#fff7ec]/50 focus:bg-white font-medium placeholder:text-[#442f2a]/40"
                        placeholder="Contoh: Naegablé"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-[#442f2a]/80 pl-1">Nomor WhatsApp</label>
                      <input
                        type="tel"
                        required
                        value={waNumber}
                        onChange={(e) => setWaNumber(e.target.value)}
                        className="w-full px-5 py-4 rounded-2xl border-2 border-[#442f2a]/10 hover:border-[#442f2a]/20 focus:border-[#442f2a] focus:ring-4 focus:ring-[#442f2a]/10 outline-none transition-all text-[#442f2a] bg-[#fff7ec]/50 focus:bg-white font-medium placeholder:text-[#442f2a]/40"
                        placeholder="Contoh: 08123456789"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#442f2a]/80 pl-1">Alamat Pengiriman</label>
                    <textarea
                      required
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-5 py-4 rounded-2xl border-2 border-[#442f2a]/10 hover:border-[#442f2a]/20 focus:border-[#442f2a] focus:ring-4 focus:ring-[#442f2a]/10 outline-none transition-all text-[#442f2a] bg-[#fff7ec]/50 focus:bg-white resize-none font-medium placeholder:text-[#442f2a]/40"
                      placeholder="Masukkan alamat lengkap (Jalan, RT/RW, Kelurahan, Kecamatan, Kota)"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-[#442f2a]/80 pl-1">Catatan Tambahan (Opsional)</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-5 py-4 rounded-2xl border-2 border-[#442f2a]/10 hover:border-[#442f2a]/20 focus:border-[#442f2a] focus:ring-4 focus:ring-[#442f2a]/10 outline-none transition-all text-[#442f2a] bg-[#fff7ec]/50 focus:bg-white resize-none font-medium placeholder:text-[#442f2a]/40"
                      placeholder="Contoh: Tolong jangan terlalu manis"
                    />
                  </div>
                </div>

                {/* Metode Pengiriman */}
                <div className="space-y-6 sm:space-y-8 pt-2">
                  <div className="flex items-center gap-4 border-b border-[#442f2a]/10 pb-4">
                    <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-orange-500/30">2</span>
                    <h4 className="text-xl sm:text-2xl font-black text-[#442f2a] tracking-tight">
                      Metode Pengiriman
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* DO Option */}
                    <button
                      type="button"
                      disabled={!deliverySettings.do}
                      onClick={() => setDeliveryMethod("do")}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                          !deliverySettings.do
                            ? "border-[#442f2a]/5 bg-[#442f2a]/5 opacity-60 cursor-not-allowed grayscale"
                            : deliveryMethod === "do"
                            ? "border-[#442f2a] bg-[#442f2a] text-[#fff7ec] shadow-lg active:scale-[0.98]"
                            : "border-[#442f2a]/15 bg-white hover:border-[#442f2a]/30 text-[#442f2a] active:scale-[0.98]"
                        }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">🚚</span>
                        <span className={`font-black text-lg ${!deliverySettings.do ? "text-[#442f2a]/50" : ""}`}>DO (Delivery Order)</span>
                      </div>
                      <p className={`text-sm font-medium leading-relaxed ${
                          !deliverySettings.do
                            ? "text-[#442f2a]/40"
                            : deliveryMethod === "do"
                            ? "text-[#fff7ec]/80"
                            : "text-[#442f2a]/60"
                        }`}>
                        {!deliverySettings.do ? "Metode ini sedang tidak tersedia." : "Pesan kurir mandiri. Wajib share live location kurir ke toko."}
                      </p>
                    </button>

                    {/* COD Option */}
                    <button
                      type="button"
                      disabled={!deliverySettings.cod}
                      onClick={() => setDeliveryMethod("cod")}
                      className={`p-5 rounded-2xl border-2 text-left transition-all group/btn ${
                          !deliverySettings.cod
                            ? "border-[#442f2a]/5 bg-[#442f2a]/5 opacity-60 cursor-not-allowed grayscale"
                            : deliveryMethod === "cod"
                            ? "border-[#442f2a] bg-[#442f2a] text-[#fff7ec] shadow-lg shadow-[#442f2a]/20 active:scale-[0.98]"
                            : "border-[#442f2a]/15 bg-white hover:border-[#442f2a]/30 hover:shadow-md text-[#442f2a] active:scale-[0.98]"
                        }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`text-2xl ${deliverySettings.cod ? "group-hover/btn:scale-110 transition-transform" : ""}`}>🤝</span>
                        <span className={`font-black text-lg ${!deliverySettings.cod ? "text-[#442f2a]/50" : ""}`}>COD</span>
                      </div>
                      <p className={`text-sm font-medium leading-relaxed ${
                          !deliverySettings.cod
                            ? "text-[#442f2a]/40"
                            : deliveryMethod === "cod"
                            ? "text-[#fff7ec]/80"
                            : "text-[#442f2a]/60"
                        }`}>
                        {!deliverySettings.cod ? "Metode ini sedang tidak tersedia." : "Lokasi COD di Indomaret Alun-Alun Kota Mojokerto, pukul 16.00 – 17.00 WIB."}
                      </p>
                    </button>

                    {/* Pick Up Option */}
                    <button
                      type="button"
                      disabled={!deliverySettings.pickup}
                      onClick={() => setDeliveryMethod("pickup")}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                          !deliverySettings.pickup
                            ? "border-[#442f2a]/5 bg-[#442f2a]/5 opacity-60 cursor-not-allowed grayscale"
                            : deliveryMethod === "pickup"
                            ? "border-[#442f2a] bg-[#442f2a] text-[#fff7ec] shadow-lg active:scale-[0.98]"
                            : "border-[#442f2a]/15 bg-white hover:border-[#442f2a]/30 text-[#442f2a] active:scale-[0.98]"
                        }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">🏪</span>
                        <span className={`font-black text-lg ${!deliverySettings.pickup ? "text-[#442f2a]/50" : ""}`}>Pick Up</span>
                      </div>
                      <p className={`text-sm font-medium leading-relaxed ${
                          !deliverySettings.pickup
                            ? "text-[#442f2a]/40"
                            : deliveryMethod === "pickup"
                            ? "text-[#fff7ec]/80"
                            : "text-[#442f2a]/60"
                        }`}>
                        {!deliverySettings.pickup ? "Metode ini sedang tidak tersedia." : "Ambil pesanan sendiri di tempat (09.00 - 15.00 WIB)."}
                      </p>
                    </button>
                  </div>

                  {/* Info Detail berdasarkan pilihan */}
                  {deliveryMethod === "cod" && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex gap-3 items-start">
                      <span className="text-xl shrink-0">📌</span>
                      <div>
                        <p className="font-bold text-[#442f2a] text-sm mb-1">Info (COD)</p>
                        <p className="text-[#442f2a]/70 text-sm leading-relaxed">
                          Hai Kak! Untuk metode COD, kita hanya bisa disatu titik saja, di <span className="font-bold">Indomaret Alun-Alun Kota Mojokerto</span> ya. Jadwal COD beroperasi pada <span className="font-bold">pukul 16:00-17:00 WIB</span>. Di luar jam tersebut, silakan pilih metode pengiriman lain ya! 🤗
                        </p>
                      </div>
                    </div>
                  )}

                  {deliveryMethod === "do" && (
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 sm:p-5 flex gap-3 items-start">
                      <span className="text-xl shrink-0">📦</span>
                      <div>
                        <p className="font-bold text-[#442f2a] text-sm mb-1">Info Delivery Order (DO)</p>
                        <p className="text-[#442f2a]/70 text-sm leading-relaxed">
                          Anda harus memesan kurir secara mandiri. Mohon <span className="font-bold">wajib membagikan tautan (link) live location kurir</span> kepada pihak toko agar pesanan bisa diserahkan ke kurir yang tepat.
                        </p>
                      </div>
                    </div>
                  )}

                  {deliveryMethod === "pickup" && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex gap-3 items-start">
                      <span className="text-xl shrink-0">🏪</span>
                      <div>
                        <p className="font-bold text-[#442f2a] text-sm mb-1">Info Pick Up (Ambil di Tempat)</p>
                        <p className="text-[#442f2a]/70 text-sm leading-relaxed">
                          Anda bisa mengambil pesanannya sendiri. Jam operasional untuk pick up adalah dari pukul <span className="font-bold">09:00 WIB hingga 15:00 WIB</span>.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Detail Pesanan Keranjang */}
                <div className="space-y-6 sm:space-y-8 pt-2">
                  <div className="flex items-center gap-4 border-b border-[#442f2a]/10 pb-4">
                    <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-stone-800 to-stone-900 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-stone-900/20">3</span>
                    <h4 className="text-xl sm:text-2xl font-black text-[#442f2a] tracking-tight">
                      Keranjang Pesanan
                    </h4>
                  </div>

                  {cart.length === 0 ? (
                    <div className="text-center py-12 px-6 bg-[#fff7ec] rounded-[2rem] border-2 border-dashed border-[#442f2a]/20">
                      <div className="text-4xl mb-3">🛒</div>
                      <p className="text-[#442f2a]/60 font-medium mb-4 text-sm sm:text-base">Keranjang pesananmu masih kosong nih.</p>
                      <button onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })} className="inline-flex items-center justify-center bg-white border border-[#442f2a]/20 px-6 sm:px-8 py-3 rounded-xl text-[#442f2a]/90 font-bold hover:bg-[#fff7ec] transition-colors shadow-sm text-sm sm:text-base active:scale-95">
                        Lihat Katalog Menu
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 sm:space-y-4">
                      {cart.map((item) => (
                        <div key={item.product.id} className="group flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 sm:p-5 rounded-2xl border border-[#442f2a]/10 hover:border-[#442f2a]/40 hover:shadow-md transition-all gap-4 sm:gap-6 relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-rose-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                          <div className="flex-1 w-full relative z-10">
                            <h5 className="font-bold text-[#442f2a] text-sm sm:text-base">{item.product.name}</h5>
                            <p className="text-[#442f2a] font-black text-sm">{formatRupiah(item.product.price)}</p>
                          </div>

                          {/* Kontrol Qty */}
                          <div className="flex items-center gap-1.5 bg-[#fff7ec] p-1.5 rounded-xl border border-[#442f2a]/10 relative z-10">
                            <button
                              type="button"
                              onClick={() => updateQty(item.product.id, item.qty - 1, item.product.stock)}
                              className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center font-bold text-[#442f2a]/60 hover:text-white hover:bg-[#442f2a] rounded-lg transition-colors bg-white shadow-sm"
                            >
                              −
                            </button>
                            <span className="font-black text-[#442f2a] w-8 sm:w-10 text-center text-sm sm:text-base">{item.qty}</span>
                            <button
                              type="button"
                              onClick={() => updateQty(item.product.id, item.qty + 1, item.product.stock)}
                              disabled={item.qty >= item.product.stock}
                              className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center font-bold text-[#442f2a]/60 hover:text-white hover:bg-[#442f2a] rounded-lg transition-colors bg-white shadow-sm disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-[#442f2a]/60"
                            >
                              +
                            </button>
                          </div>

                          <div className="text-left sm:text-right w-full sm:w-32 relative z-10 border-t sm:border-t-0 border-[#442f2a]/10 pt-3 sm:pt-0 mt-1 sm:mt-0">
                            <p className="text-[10px] sm:text-xs text-[#442f2a]/40 font-bold uppercase tracking-wider mb-0.5">Subtotal</p>
                            <p className="font-black text-[#442f2a] text-sm sm:text-base">{formatRupiah(item.product.price * item.qty)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dropdown Tambah Cepat */}
                  <div className="pt-2">
                    <div className="relative">
                      <select
                        value=""
                        onChange={(e) => {
                          const product = products.find(p => p.id === e.target.value);
                          if (product) addToCart(product);
                        }}
                        className="w-full px-5 py-4 rounded-2xl border-2 border-[#442f2a]/10 hover:border-[#442f2a]/20 focus:border-[#442f2a] focus:ring-4 focus:ring-[#442f2a]/10 outline-none transition-all text-[#442f2a]/80 bg-[#fff7ec]/50 font-bold cursor-pointer appearance-none"
                      >
                        <option value="" disabled>✨ Klik untuk tambah menu lain ke keranjang</option>
                        {products.filter(p => p.is_active !== false && p.stock > 0 && !cart.find(c => c.product.id === p.id)).map(p => (
                          <option key={p.id} value={p.id}>{p.name} - {formatRupiah(p.price)}</option>
                        ))}
                      </select>
                      <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-[#442f2a]/40">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total Ringkasan */}
                {cart.length > 0 && (
                  <div className="bg-[#442f2a] p-6 sm:p-8 rounded-[2rem] flex flex-col border border-[#442f2a] gap-5 mt-8 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/3 w-40 h-40 bg-gradient-to-bl from-rose-500 to-pink-500 blur-3xl rounded-full opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity duration-700"></div>
                    <div className="flex flex-col gap-2 relative z-10 border-b border-white/20 pb-4">
                      <div className="flex justify-between items-center w-full">
                        <span className="text-[#fff7ec]/70 font-medium text-sm">Subtotal Pesanan</span>
                        <span className="text-lg font-bold text-[#fff7ec]">
                          {formatRupiah(total_price)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center w-full">
                        <span className="text-[#fff7ec]/70 font-medium text-sm">Biaya Layanan/QRIS</span>
                        <span className="text-lg font-bold text-[#fff7ec]">
                          {formatRupiah(500)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-between items-center w-full gap-2 sm:gap-0 relative z-10 pt-1">
                      <span className="text-[#fff7ec]/80 font-bold text-sm sm:text-base uppercase tracking-widest">Total Pembayaran</span>
                      <span className="text-3xl sm:text-4xl font-black text-[#fff7ec] drop-shadow-sm">
                        {formatRupiah(total_price + 500)}
                      </span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 mt-2 flex gap-3 items-start shadow-sm relative z-10">
                      <div className="bg-[#f5cbd7]/20 text-[#f5cbd7] p-1.5 rounded-lg shrink-0 mt-0.5">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-xs sm:text-sm text-[#fff7ec]/90 font-medium leading-relaxed">
                        <span className="font-bold text-[#fff7ec]">Catatan:</span> Nominal rupiah belakang pada total pembayaran bisa berubah 1-99 rupiah saat proses pembayaran dikarenakan <span className="italic text-[#f5cbd7]">generate</span> sistem QRIS otomatis.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || cart.length === 0}
                  className={`group w-full py-4 sm:py-5 rounded-[2rem] font-black text-lg sm:text-xl shadow-lg transition-all duration-300 flex items-center justify-center gap-3 mt-6 relative overflow-hidden border border-[#442f2a] ${isSubmitting || cart.length === 0
                      ? 'bg-[#fff7ec]/80 text-[#442f2a]/40 shadow-none cursor-not-allowed border-[#442f2a]/20'
                      : 'bg-[#f5cbd7] text-[#442f2a] hover:bg-[#eeb1c3] hover:-translate-y-1 hover:shadow-[#f5cbd7]/50 active:scale-[0.98]'
                    }`}
                >
                  {/* Efek kilap (shine effect) pada tombol aktif saat di hover */}
                  {(!isSubmitting && cart.length > 0) && (
                    <div className="absolute inset-0 -translate-x-[150%] bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none"></div>
                  )}

                  <span className="relative z-10 flex items-center gap-3">
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-6 w-6 border-t-4 border-b-4 border-white border-l-4 border-l-transparent border-r-4 border-r-transparent"></div>
                        Memproses Pesanan...
                      </>
                    ) : (
                      <>
                        Kirim Pesanan Sekarang
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transform transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </>
                    )}
                  </span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Success Popup Modal */}
      {showSuccessPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#442f2a]/60 backdrop-blur-sm" onClick={() => setShowSuccessPopup(false)}></div>
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-gradient-to-r from-[#f5cbd7] to-[#f790b2] h-32 flex items-center justify-center relative">
              <div className="absolute -bottom-8 w-16 h-16 bg-[#fff7ec] rounded-full flex items-center justify-center shadow-lg border-2 border-[#442f2a]/10">
                <span className="text-2xl">✅</span>
              </div>
            </div>
            <div className="pt-12 pb-8 px-6 sm:px-8 text-center">
              <h3 className="text-2xl font-black text-[#442f2a] mb-2 font-serif">Pesanan Tersimpan! 🎉</h3>
              <p className="text-[#442f2a]/60 font-medium mb-6 leading-relaxed text-sm">
                Pesanan Anda sudah tersimpan. Silakan minta barcode QRIS ke admin untuk pembayaran.
              </p>
              <p className="text-[#442f2a]/50 font-semibold mb-6 text-xs">
                Waktu pesanan:{" "}
                <span className="text-[#442f2a]">
                  {latestOrderCreatedAt ? `${formatWIB(latestOrderCreatedAt)} WIB` : "-"}
                </span>
              </p>

              {/* Tombol Minta QRIS */}
              <a
                href={generatedWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-[#fff7ec] shadow-xl bg-[#442f2a] hover:bg-[#2e1d1a] hover:-translate-y-1 hover:shadow-[#442f2a]/30 active:scale-95 transition-all mb-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Minta Barcode QRIS
              </a>

              {/* Tombol Cek Pesanan */}
              <button
                onClick={() => {
                  setShowSuccessPopup(false);
                  setTimeout(() => document.getElementById("order-lookup")?.scrollIntoView({ behavior: "smooth" }), 300);
                }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[#442f2a] bg-[#fff7ec] border border-[#442f2a]/20 hover:bg-[#f5cbd7]/30 active:scale-95 transition-all mb-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Cek Status Pesanan
              </button>

              <button
                onClick={() => setShowSuccessPopup(false)}
                className="w-full py-2.5 rounded-xl font-bold text-[#442f2a]/40 hover:text-[#442f2a]/60 transition-colors text-sm"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Lookup Section */}
      <section id="order-lookup" className="bg-gradient-to-b from-[#fff7ec] to-[#fff7ec] py-16 sm:py-24 px-4 sm:px-6 relative overflow-hidden scroll-mt-20">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-gradient-to-t from-rose-200/15 to-transparent blur-[100px] rounded-full pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-block py-1.5 px-4 rounded-full bg-white border border-[#442f2a]/20 text-[#442f2a] text-xs sm:text-sm font-bold tracking-widest uppercase mb-4 shadow-sm">
              🔍 Cek Pesanan
            </span>
            <h3 className="text-3xl sm:text-4xl font-black text-[#442f2a] mb-4 tracking-tight font-serif">Cek Status Pesanan</h3>
            <p className="text-[#442f2a]/60 text-base sm:text-lg font-medium max-w-2xl mx-auto">
              Masukkan nomor HP untuk melihat pesanan Anda
            </p>
          </div>

          <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] sm:rounded-[3rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden border border-white p-2 sm:p-3">
            <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-sm border border-stone-50">
              {/* Search Input */}
              <div className="flex gap-3 mb-6">
                <div className="relative flex-1">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#442f2a]/40">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={lookupQuery}
                    onChange={(e) => setLookupQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                    placeholder="08123456789"
                    className="w-full pl-12 pr-5 py-4 rounded-2xl border-2 border-[#442f2a]/10 hover:border-[#442f2a]/20 focus:border-[#442f2a] focus:ring-4 focus:ring-[#442f2a]/10 outline-none transition-all text-[#442f2a] bg-[#fff7ec]/50 focus:bg-white font-medium placeholder:text-[#442f2a]/40"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={isLookingUp || !lookupQuery.trim()}
                  className="px-5 sm:px-6 py-4 bg-[#442f2a] text-[#fff7ec] rounded-2xl font-bold hover:bg-[#2e1d1a] transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {isLookingUp ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white border-l-2 border-l-transparent border-r-2 border-r-transparent"></div>
                  ) : (
                    "Cek"
                  )}
                </button>
              </div>

              {/* Results */}
              {hasSearched && (
                <div className="space-y-4">
                  {lookupResults.length === 0 ? (
                    <div className="text-center py-10 px-6 bg-[#fff7ec] rounded-2xl border-2 border-dashed border-[#442f2a]/15">
                      <div className="text-3xl mb-3">📭</div>
                      <p className="text-[#442f2a]/50 font-medium text-sm leading-relaxed">Pesanan tidak ditemukan.<br className="sm:hidden" /> Coba dengan nomor HP lain.</p>
                    </div>
                  ) : (
                    lookupResults.map((order) => (
                      <div key={order.id} className="bg-[#fff7ec] rounded-2xl p-5 sm:p-6 border border-[#442f2a]/10 hover:border-[#442f2a]/20 transition-all">
                        {/* Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-4 border-b border-[#442f2a]/10">
                          <div>
                            <h5 className="font-black text-[#442f2a] text-base sm:text-lg">{order.customer_name}</h5>
                            <p className="text-[#442f2a]/50 text-xs font-medium">
                              {order.created_at ? `${formatWIB(order.created_at)} WIB` : "-"}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <span className={`text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full ${order.payment_status === "unpaid"
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                              }`}>
                              {order.payment_status === "unpaid" ? "Belum Bayar" : order.payment_status === "paid_qris" ? "QRIS ✓" : "Cash ✓"}
                            </span>
                            <span className={`text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full ${order.production_status?.toLowerCase() === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : order.production_status?.toLowerCase() === "batal"
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                              }`}>
                              {order.production_status?.toLowerCase() === "pending" ? "⏳ Proses" : order.production_status?.toLowerCase() === "batal" ? "❌ Batal" : "✅ Selesai"}
                            </span>
                          </div>
                        </div>

                        {/* Detail */}
                        <div className="space-y-2 mb-4">
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-[#442f2a]/40 shrink-0">📱</span>
                            <span className="text-[#442f2a]/70 font-medium">{order.wa_number}</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-[#442f2a]/40 shrink-0">📍</span>
                            <span className="text-[#442f2a]/70 font-medium">{order.address}</span>
                          </div>
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-[#442f2a]/40 shrink-0">
                              {order.delivery_method === "cod" ? "🤝" : order.delivery_method === "pickup" ? "🏪" : "🚚"}
                            </span>
                            <span className="text-[#442f2a]/70 font-medium">
                              {order.delivery_method === "cod" ? "COD - Alun-Alun Mojokerto" : order.delivery_method === "pickup" ? "Pick Up - Ambil di Tempat" : "DO - Delivery Order"}
                            </span>
                          </div>
                        </div>

                        {/* Items */}
                        <div className="bg-white rounded-xl p-3 sm:p-4 space-y-2 mb-3">
                          {(order.items as { name: string; qty: number; price: number }[]).map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm">
                              <span className="text-[#442f2a]/80 font-medium">{item.name} x{item.qty}</span>
                              <span className="text-[#442f2a] font-bold">{formatRupiah(item.price * item.qty)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Total */}
                        <div className="flex justify-between items-center pt-3 border-t border-[#442f2a]/10">
                          <span className="text-sm font-bold text-[#442f2a]/60 uppercase tracking-wider">Total</span>
                          <span className="text-xl font-black text-[#442f2a]">{formatRupiah(order.total_price)}</span>
                        </div>

                        {/* Action Button */}
                        <div className="mt-4">
                          {order.payment_status === "unpaid" ? (
                            <a
                              href={`https://wa.me/6281336994747?text=${encodeURIComponent(
                                `Halo Admin, saya mau bayar pesanan via QRIS:\n- Nama: ${order.customer_name}\n- WA: ${order.wa_number}\n\n*Pesanan:*\n${(order.items as { name: string; qty: number; price: number }[]).map(i => `- ${i.name} x${i.qty} = ${formatRupiah(i.price * i.qty)}`).join("\n")}\n\n*Total Tagihan: ${formatRupiah(order.total_price)}*\n\nMohon kirimkan barcode QRIS untuk pembayaran. Terima kasih.`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-[#fff7ec] bg-[#442f2a] hover:bg-[#2e1d1a] active:scale-95 transition-all text-sm"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                              </svg>
                              Bayar via QRIS
                            </a>
                          ) : (
                            <a
                              href={`https://wa.me/6281336994747?text=${encodeURIComponent(
                                `Halo Admin, saya ingin menanyakan pesanan saya:\n- Nama: ${order.customer_name}\n- WA: ${order.wa_number}\n\n*Pesanan:*\n${(order.items as { name: string; qty: number; price: number }[]).map(i => `- ${i.name} x${i.qty} = ${formatRupiah(i.price * i.qty)}`).join("\n")}\n\n*Total: ${formatRupiah(order.total_price)}*\n\nTerima kasih.`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-[#442f2a] bg-white border border-[#442f2a]/20 hover:bg-[#f5cbd7]/30 active:scale-95 transition-all text-sm"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z" />
                              </svg>
                              Chat Admin
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Lokasi Pick-Up & DO Section */}
      <section className="bg-gradient-to-b from-[#fff7ec] to-white py-16 sm:py-24 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-rose-200/20 to-transparent blur-[100px] rounded-full pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-block py-1.5 px-4 rounded-full bg-white border border-[#442f2a]/20 text-[#442f2a] text-xs sm:text-sm font-bold tracking-widest uppercase mb-4 shadow-sm">
              📍 Lokasi
            </span>
            <h3 className="text-3xl sm:text-4xl font-black text-[#442f2a] mb-4 tracking-tight font-serif">Lokasi Pick-Up & Delivery Order (DO)</h3>
            <p className="text-[#442f2a]/60 text-base sm:text-lg font-medium max-w-2xl mx-auto">
              Titik pengambilan & pengiriman pesanan Naegablé
            </p>
          </div>

          <div className="bg-white/60 backdrop-blur-xl rounded-[2rem] sm:rounded-[3rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden border border-white p-2 sm:p-3">
            <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-sm border border-stone-50">
              <div className="w-full h-[300px] sm:h-[400px]">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1500!2d112.46758141671499!3d-7.451004745649361!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zN8KwMjcnMDMuNiJTIDExMsKwMjgnMDMuMyJF!5e0!3m2!1sid!2sid!4v1"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="rounded-[1.5rem] sm:rounded-[2.5rem]"
                ></iframe>
              </div>
              <div className="p-5 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-black text-[#442f2a] text-lg sm:text-xl mb-1">📍 Lokasi Pick-Up & DO Naegablé</h4>
                  <p className="text-[#442f2a]/60 text-sm font-medium">Koordinat: -7.4510, 112.4676</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href="https://www.google.com/maps/dir/?api=1&destination=-7.451004745649361,112.46758141671499"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#442f2a] text-[#fff7ec] rounded-xl font-bold text-sm hover:bg-[#2e1d1a] transition-all hover:shadow-lg active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Buka di Google Maps
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      const shareUrl = "https://www.google.com/maps/dir/?api=1&destination=-7.451004745649361,112.46758141671499";
                      const shareText = "📍 Lokasi Pick-Up & DO Naegablé - Titik pengambilan pesanan:\n" + shareUrl;
                      if (navigator.share) {
                        navigator.share({ title: "Lokasi Pick-Up & DO Naegablé", text: "📍 Titik pengambilan pesanan Naegablé", url: shareUrl });
                      } else {
                        navigator.clipboard.writeText(shareText);
                        alert("Link lokasi berhasil disalin! Kirimkan ke kurir Anda.");
                      }
                    }}
                    className="w-11 h-11 flex items-center justify-center bg-[#f5cbd7] text-[#442f2a] rounded-xl hover:bg-[#eeb1c3] transition-all active:scale-95 border border-[#442f2a]/20"
                    title="Share ke Kurir"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#fff7ec] py-12 text-center">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img
              src="/assets/icons/icon-1.png"
              alt="Naegablé Logo"
              className="w-12 h-12 object-contain drop-shadow-sm"
            />
            <h2 className="text-2xl font-black text-[#442f2a] tracking-tight">Naegablé</h2>
          </div>
          <p className="font-medium text-sm text-[#442f2a]/60">&copy; {new Date().getFullYear()} Naegablé Landing Page. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
