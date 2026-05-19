const fs = require('fs');

let content = fs.readFileSync('app/page.tsx', 'utf8');

const replacements = [
  // 1. Backgrounds
  [/bg-stone-50/g, "bg-[#fff7ec]"],
  [/bg-stone-100/g, "bg-[#fff7ec]/80"],
  [/bg-rose-50\b/g, "bg-[#f5cbd7]/30"],
  [/bg-stone-900/g, "bg-[#442f2a]"],
  [/bg-stone-800/g, "bg-[#442f2a]"],
  [/from-stone-50/g, "from-[#fff7ec]"],
  [/to-rose-50\/50/g, "to-[#fff7ec]"],
  [/bg-gradient-to-b from-stone-50 to-rose-50\/50/g, "bg-[#fff7ec]"],
  [/bg-gradient-to-br from-stone-900 to-stone-800/g, "bg-[#442f2a]"],
  [/bg-gradient-to-r from-rose-500 to-pink-500/g, "bg-[#f5cbd7]"],
  [/hover:from-rose-400 hover:to-pink-400/g, "hover:bg-[#eeb1c3]"],
  [/bg-rose-500/g, "bg-[#f5cbd7]"],
  [/hover:bg-rose-600/g, "hover:bg-[#eeb1c3]"],
  [/hover:bg-stone-800/g, "hover:bg-[#442f2a]"],
  [/bg-stone-950/g, "bg-[#2a1c19]"],

  // 2. Texts
  [/text-stone-900/g, "text-[#442f2a]"],
  [/text-stone-800/g, "text-[#442f2a]"],
  [/text-stone-700/g, "text-[#442f2a]/90"],
  [/text-stone-600/g, "text-[#442f2a]/80"],
  [/text-stone-500/g, "text-[#442f2a]/60"],
  [/text-stone-400/g, "text-[#442f2a]/40"],
  [/text-rose-600/g, "text-[#442f2a]"],
  [/text-rose-500/g, "text-[#442f2a]"],
  [/text-rose-400/g, "text-[#442f2a]"],
  [/text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-400/g, "text-[#442f2a]"],
  [/text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500/g, "text-[#442f2a]"],
  
  // 3. Borders & Rings
  [/border-stone-100/g, "border-[#442f2a]/10"],
  [/border-stone-200/g, "border-[#442f2a]/20"],
  [/border-stone-300/g, "border-[#442f2a]/30"],
  [/border-rose-100/g, "border-[#442f2a]/20"],
  [/border-rose-500/g, "border-[#442f2a]"],
  [/border-stone-700/g, "border-[#442f2a]"],
  [/ring-rose-500\/50/g, "ring-[#442f2a]/30"],
  [/hover:border-rose-200/g, "hover:border-[#442f2a]/40"],
  [/hover:border-rose-400/g, "hover:border-[#442f2a]"],
  [/focus:border-rose-400/g, "focus:border-[#442f2a]"],
  [/focus:ring-rose-400\/10/g, "focus:ring-[#442f2a]/10"],
  [/shadow-rose-500\/40/g, "shadow-[#f5cbd7]/50"],
  [/shadow-rose-500\/20/g, "shadow-[#f5cbd7]/30"],
  [/shadow-rose-500\/10/g, "shadow-[#f5cbd7]/20"],
  [/shadow-rose-500\/30/g, "shadow-[#f5cbd7]/40"],
  
  // 4. Manual Header adjustment
  [/bg-rose-500 text-white px-6 py-2\.5 rounded-full font-bold text-sm hover:bg-rose-600 hover:shadow-lg hover:shadow-rose-500\/40/g, "bg-[#f5cbd7] text-[#442f2a] px-6 py-2.5 rounded-full font-bold text-sm hover:bg-[#eeb1c3] hover:shadow-lg border border-[#442f2a] hover:shadow-[#f5cbd7]/40"]
];

for (const [regex, replacement] of replacements) {
  content = content.replace(regex, replacement);
}

// 5. Button Cart Adjustment in Map
const oldButtonRegex = /<button[\s\S]*?onClick=\{\(\) => addToCart\(product\)\}[\s\S]*?disabled=\{product\.stock === 0\}[\s\S]*?className=\{`(.*?)`\}[\s\S]*?>[\s\S]*?<\/button>/;
const newButtonStr = `<button 
                      onClick={() => addToCart(product)}
                      disabled={product.stock === 0}
                      className={\`w-full px-4 py-2 rounded-xl font-bold transition-all active:scale-95 text-sm md:text-base flex justify-center items-center gap-2 \${
                        product.stock === 0 
                        ? 'bg-transparent text-[#442f2a]/40 border border-[#442f2a]/20 cursor-not-allowed' 
                        : isSelected 
                        ? 'bg-[#f5cbd7] text-[#442f2a] font-bold border-2 border-[#442f2a] shadow-sm'
                        : 'bg-transparent text-[#442f2a] border border-[#442f2a]/30 hover:bg-[#f5cbd7] hover:border-[#442f2a]'
                      }\`}
                    >
                      {product.stock === 0 ? 'Habis' : isSelected ? '✓ Terpilih' : '+ Tambah'}
                    </button>`;

content = content.replace(oldButtonRegex, newButtonStr);

fs.writeFileSync('app/page.tsx', content);
console.log('Done');
