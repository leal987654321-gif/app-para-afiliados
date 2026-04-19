import React, { useState, useEffect, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Search, 
  TrendingUp, 
  DollarSign, 
  Activity, 
  Filter, 
  ArrowUpRight, 
  Loader2, 
  ExternalLink,
  Heart,
  Droplets,
  Scale,
  Pill,
  Globe,
  X,
  Shuffle,
  Brain,
  User,
  Sparkles,
  Smile,
  Moon,
  Sun
} from 'lucide-react';
import { 
  ComposedChart, 
  Bar, 
  Line,
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import { translations, Language } from './translations';

// --- Types ---

interface Product {
  id: string;
  name: string;
  category: 'Weight Loss' | 'Diabetes' | 'Nutraceuticals' | 'General Health' | "Men's Health" | "Women's Health" | 'Skin Care' | 'Dental Care' | 'Mental Health';
  price: number;
  salesVolume: number; // Monthly units
  commission: number; // Percentage
  gravity: number; // Affiliate popularity score
  description: string;
  pros: string[];
  cons: string[];
  affiliateLink?: string;
  trend: 'up' | 'stable' | 'down';
}

interface ResearchResult {
  products: Product[];
  marketInsights: string;
}

// --- Helpers ---

const pseudoRandom = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
};

const getProductTrendData = (product: Product, timeframe: '1w' | '1q' | '6m' | '12m') => {
  let labels: string[] = [];
  let count = 6;
  
  switch (timeframe) {
    case '1w':
      labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      count = 7;
      break;
    case '1q':
      labels = ['M1', 'M2', 'M3'];
      count = 3;
      break;
    case '6m':
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      count = 6;
      break;
    case '12m':
      labels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
      count = 12;
      break;
  }
  
  const baseVolume = product.salesVolume;
  const baseGravity = product.gravity;
  const baseCommission = product.commission;
  const trendFactor = product.trend === 'up' ? 1.05 : product.trend === 'down' ? 0.95 : 1.01;
  
  return labels.map((period, i) => {
    const seed = `${product.id}-${timeframe}-${i}`;
    const multiplier = Math.pow(trendFactor, i - Math.floor(count / 2)); 
    const vNoise = 1 + (pseudoRandom(seed + '-v') * 0.14 - 0.07);
    const cNoise = 1 + (pseudoRandom(seed + '-c') * 0.06 - 0.03);
    
    return {
      period,
      volume: Math.round(baseVolume * multiplier * vNoise),
      gravity: Math.round(baseGravity * multiplier * vNoise),
      commission: Math.round(baseCommission * cNoise)
    };
  });
};

const calculateStabilityScore = (product: Product, timeframe: '1w' | '1q' | '6m' | '12m') => {
  const data = getProductTrendData(product, timeframe);
  if (data.length < 2) return 5;

  // Calculate volatility (standard deviation / mean)
  const volumes = data.map(d => d.volume);
  const vMean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const vVariance = volumes.reduce((a, b) => a + Math.pow(b - vMean, 2), 0) / volumes.length;
  const vVolatility = vMean === 0 ? 0 : Math.sqrt(vVariance) / vMean;

  const commissions = data.map(d => d.commission);
  const cMean = commissions.reduce((a, b) => a + b, 0) / commissions.length;
  const cVariance = commissions.reduce((a, b) => a + Math.pow(b - cMean, 2), 0) / commissions.length;
  const cVolatility = cMean === 0 ? 0 : Math.sqrt(cVariance) / cMean;

  // combined volatility (0 to ~0.2 based on our noise)
  const totalVolatility = (vVolatility + cVolatility) / 2;
  
  // Map totalVolatility to 1-5 score
  // Low volatility (e.g. 0.02) -> 5
  // High volatility (e.g. 0.15) -> 1
  if (totalVolatility < 0.03) return 5;
  if (totalVolatility < 0.06) return 4;
  if (totalVolatility < 0.09) return 3;
  if (totalVolatility < 0.12) return 2;
  return 1;
};

// --- Gemini Service ---

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function researchProducts(query: string, lang: Language): Promise<ResearchResult> {
  const prompt = `Research the top-selling health products in the USA for the niche: "${query}". 
  Focus on niches like Weight Loss, Diabetes, Nutraceuticals, Men's Health, Women's Health, Skin Care, Dental Care, and Mental Health. 
  Provide a list of 8-12 real or highly representative top-selling products.
  
  For EACH product description:
  - Create an engaging, persuasive, and SEO-friendly description (approx. 150-250 words) suitable for affiliate marketing.
  - Focus on the unique selling points, science-backed benefits, and problem-solving aspects.
  - Include relevant high-volume keywords naturally within the text.
  - Use Markdown formatting (bolding for emphasis, bullet points for key features) within the description string to enhance readability.
  - The tone should be authoritative, professional, yet encouraging and persuasive.
  
  For each product, include:
  - Name
  - Category (MUST be one of: 'Weight Loss', 'Diabetes', 'Nutraceuticals', 'General Health', "Men's Health", "Women's Health", 'Skin Care', 'Dental Care', 'Mental Health')
  - Estimated Price (USD)
  - Estimated Monthly Sales Volume
  - Typical Affiliate Commission (%)
  - Gravity/Popularity Score (0-100)
  - The enhanced, persuasive Description (using Markdown)
  - Pros and Cons (as lists of 3-5 items each)
  - Market Trend (up, stable, down)
  
  Also provide a comprehensive market insight summary (in Markdown) for this niche in the USA, including current consumer behavior and growth projections.
  IMPORTANT: All text content (description, pros, cons, marketInsights) MUST be in the language: ${lang === 'pt' ? 'Portuguese' : lang === 'es' ? 'Spanish' : 'English'}.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          products: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                category: { 
                  type: Type.STRING, 
                  enum: [
                    'Weight Loss', 
                    'Diabetes', 
                    'Nutraceuticals', 
                    'General Health', 
                    "Men's Health", 
                    "Women's Health", 
                    'Skin Care', 
                    'Dental Care', 
                    'Mental Health'
                  ] 
                },
                price: { type: Type.NUMBER },
                salesVolume: { type: Type.NUMBER },
                commission: { type: Type.NUMBER },
                gravity: { type: Type.NUMBER },
                description: { type: Type.STRING },
                pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                cons: { type: Type.ARRAY, items: { type: Type.STRING } },
                trend: { type: Type.STRING, enum: ['up', 'stable', 'down'] }
              },
              required: ['name', 'category', 'price', 'salesVolume', 'commission', 'gravity', 'description', 'trend']
            }
          },
          marketInsights: { type: Type.STRING }
        },
        required: ['products', 'marketInsights']
      }
    }
  });

  try {
    const data = JSON.parse(response.text);
    return {
      products: data.products.map((p: any, i: number) => ({ ...p, id: p.id || `prod-${i}` })),
      marketInsights: data.marketInsights
    };
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("Failed to fetch research data.");
  }
}

// --- Components ---

const StatCard = ({ label, value, icon: Icon, color }: { label: string, value: string | number, icon: any, color: string }) => (
  <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4 transition-colors">
    <div className={cn("p-3 rounded-xl", color)}>
      <Icon size={24} className="text-white" />
    </div>
    <div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  </div>
);

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    const savedLang = localStorage.getItem('healthAffiliate_lang');
    return (savedLang as Language) || 'pt';
  });
  const [query, setQuery] = useState(() => {
    return localStorage.getItem('healthAffiliate_query') || '';
  });
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ResearchResult | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [minVolume, setMinVolume] = useState(0);
  const [minGravity, setMinGravity] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'volume-desc' | 'volume-asc' | 'gravity-desc' | 'gravity-asc' | 'commission-desc' | 'commission-asc' | 'price-desc' | 'price-asc'>('volume-desc');
  const [visibleMetrics, setVisibleMetrics] = useState<Set<string>>(new Set(['volume', 'gravity', 'commission']));
  const [metricTypes, setMetricTypes] = useState<Record<string, 'bar' | 'line' | 'area'>>({
    volume: 'bar',
    gravity: 'bar',
    commission: 'line'
  });
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [visibleComparisonMetrics, setVisibleComparisonMetrics] = useState<Set<string>>(new Set(['price', 'commission', 'gravity', 'volume', 'trend', 'descLength', 'prosConsCount']));
  const [showComparisonSettings, setShowComparisonSettings] = useState(false);
  const [visibleTrendMetrics, setVisibleTrendMetrics] = useState<Set<string>>(new Set(['volume', 'gravity', 'commission']));
  const [trendTimeframe, setTrendTimeframe] = useState<'1w' | '1q' | '6m' | '12m'>('6m');
  const [expandedDesc, setExpandedDesc] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('healthAffiliate_darkMode') === 'true';
  });

  const t = translations[lang];

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('healthAffiliate_darkMode', darkMode.toString());
  }, [darkMode]);

  const categories = [
    { id: 'All', label: t.all },
    { id: 'Weight Loss', label: t.weightLoss },
    { id: 'Diabetes', label: t.diabetes },
    { id: 'Nutraceuticals', label: t.nutraceuticals },
    { id: 'General Health', label: t.generalHealth },
    { id: "Men's Health", label: t.mensHealth },
    { id: "Women's Health", label: t.womensHealth },
    { id: 'Skin Care', label: t.skinCare },
    { id: 'Dental Care', label: t.dentalCare },
    { id: 'Mental Health', label: t.mentalHealth }
  ];

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const searchQuery = query || (lang === 'pt' ? 'Saúde e Emagrecimento' : 'Weight Loss & Health');
    
    setLoading(true);
    localStorage.setItem('healthAffiliate_query', searchQuery);
    try {
      const result = await researchProducts(searchQuery, lang);
      setData(result);
      setSelectedProduct(null);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('healthAffiliate_lang', lang);
    handleSearch();
  }, [lang]);

  const toggleCompare = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const comparedProducts = useMemo(() => {
    if (!data) return [];
    return data.products.filter(p => compareIds.includes(p.id));
  }, [data, compareIds]);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    let products = [...data.products];
    if (selectedCategory !== 'All') {
      products = products.filter(p => p.category === selectedCategory);
    }
    
    products = products.filter(p => p.salesVolume >= minVolume && p.gravity >= minGravity);

    // Sorting logic
    const [field, order] = sortBy.split('-');
    return products.sort((a, b) => {
      let valA: number, valB: number;
      switch (field) {
        case 'volume': valA = a.salesVolume; valB = b.salesVolume; break;
        case 'gravity': valA = a.gravity; valB = b.gravity; break;
        case 'commission': valA = a.commission; valB = b.commission; break;
        case 'price': valA = a.price; valB = b.price; break;
        default: valA = a.salesVolume; valB = b.salesVolume;
      }
      return order === 'desc' ? valB - valA : valA - valB;
    });
  }, [data, selectedCategory, minVolume, minGravity, sortBy]);

  const chartData = useMemo(() => {
    return filteredProducts.map(p => ({
      name: p.name.length > 15 ? p.name.substring(0, 12) + '...' : p.name,
      fullName: p.name,
      volume: p.salesVolume,
      gravity: p.gravity,
      commission: p.commission
    })).sort((a, b) => b.volume - a.volume);
  }, [filteredProducts]);

  const trendData = useMemo(() => {
    if (!selectedProduct) return [];
    return getProductTrendData(selectedProduct, trendTimeframe);
  }, [selectedProduct, trendTimeframe]);

  const toggleMetric = (metric: string) => {
    const next = new Set(visibleMetrics);
    if (next.has(metric)) {
      if (next.size > 1) next.delete(metric);
    } else {
      next.add(metric);
    }
    setVisibleMetrics(next);
  };

  const updateMetricType = (metric: string, type: 'bar' | 'line' | 'area') => {
    setMetricTypes(prev => ({ ...prev, [metric]: type }));
  };

  const toggleComparisonMetric = (metric: string) => {
    const next = new Set(visibleComparisonMetrics);
    if (next.has(metric)) {
      if (next.size > 1) next.delete(metric);
    } else {
      next.add(metric);
    }
    setVisibleComparisonMetrics(next);
  };

  const toggleTrendMetric = (metric: string) => {
    const next = new Set(visibleTrendMetrics);
    if (next.has(metric)) {
      if (next.size > 1) next.delete(metric);
    } else {
      next.add(metric);
    }
    setVisibleTrendMetrics(next);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors">
      {/* Sidebar / Navigation */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-50 px-6 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-600 p-1.5 rounded-lg">
            <Activity className="text-white" size={20} />
          </div>
          <span className="font-bold text-xl tracking-tight dark:text-white">{t.appName}<span className="text-emerald-600">{t.appPro}</span></span>
        </div>
        
        <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-8 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-full py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-emerald-500 transition-all text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </form>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-400"
            title={darkMode ? t.lightMode : t.darkMode}
          >
            {darkMode ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} />}
          </button>

          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium text-slate-600 dark:text-slate-400">
              <Globe size={18} className="text-emerald-600" />
              {lang.toUpperCase()}
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all py-1 min-w-[120px]">
              <button onClick={() => setLang('en')} className={cn("w-full text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300", lang === 'en' && "text-emerald-600 dark:text-emerald-400 font-bold")}>English</button>
              <button onClick={() => setLang('pt')} className={cn("w-full text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300", lang === 'pt' && "text-emerald-600 dark:text-emerald-400 font-bold")}>Português</button>
              <button onClick={() => setLang('es')} className={cn("w-full text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300", lang === 'es' && "text-emerald-600 dark:text-emerald-400 font-bold")}>Español</button>
            </div>
          </div>
          <button className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors hidden sm:block">{t.usaMarket}</button>
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-xs">US</div>
        </div>
      </nav>

      <main className="pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">{t.dashboardTitle}</h1>
          <p className="text-slate-500 dark:text-slate-400">{t.dashboardSubtitle}</p>
        </header>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard label={t.nichePotential} value={t.high} icon={TrendingUp} color="bg-blue-500" />
          <StatCard label={t.avgCommission} value="35%" icon={DollarSign} color="bg-emerald-500" />
          <StatCard label={t.topCategory} value={t.weightLoss} icon={Scale} color="bg-amber-500" />
          <StatCard label={t.marketGrowth} value="+12.4%" icon={ArrowUpRight} color="bg-purple-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: List and Filters */}
          <div className="lg:col-span-2 space-y-6 min-w-0">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-4 overflow-x-auto pb-1 scrollbar-hide">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                        selectedCategory === cat.id 
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/20" 
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <select 
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-400 px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 outline-none uppercase tracking-wider"
                  >
                    <option value="volume-desc">{t.volumeDesc}</option>
                    <option value="volume-asc">{t.volumeAsc}</option>
                    <option value="gravity-desc">{t.gravityDesc}</option>
                    <option value="gravity-asc">{t.gravityAsc}</option>
                    <option value="commission-desc">{t.commissionDesc}</option>
                    <option value="commission-asc">{t.commissionAsc}</option>
                    <option value="price-desc">{t.priceDesc}</option>
                    <option value="price-asc">{t.priceAsc}</option>
                  </select>
                  
                  {(minVolume > 0 || minGravity > 0) && (
                    <button 
                      onClick={() => { setMinVolume(0); setMinGravity(0); }}
                      className="text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-wider px-2"
                    >
                      {t.reset}
                    </button>
                  )}
                  <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      showFilters ? "bg-emerald-100 text-emerald-600" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <Filter size={18} />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-slate-50 border-b border-slate-100"
                  >
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex justify-between">
                          {t.minVolume}
                          <span className="text-emerald-600 dark:text-emerald-400">{minVolume}</span>
                        </label>
                        <input 
                          type="range" 
                          min="0" 
                          max="5000" 
                          step="100"
                          value={minVolume}
                          onChange={(e) => setMinVolume(Number(e.target.value))}
                          className="w-full accent-emerald-600 dark:accent-emerald-500 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex justify-between">
                          {t.minGravity}
                          <span className="text-blue-600 dark:text-blue-400">{minGravity}</span>
                        </label>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          step="5"
                          value={minGravity}
                          onChange={(e) => setMinGravity(Number(e.target.value))}
                          className="w-full accent-blue-600 dark:accent-blue-500 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
                {loading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="animate-spin text-emerald-600 dark:text-emerald-500" size={40} />
                    <p className="text-slate-500 dark:text-slate-400 font-medium">{t.analyzing}</p>
                  </div>
                ) : filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => (
                    <motion.div 
                      key={product.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => setSelectedProduct(product)}
                      className={cn(
                        "p-5 flex items-center gap-6 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 group",
                        selectedProduct?.id === product.id && "bg-emerald-50/50 dark:bg-emerald-900/10 border-l-4 border-emerald-600"
                      )}
                    >
                      <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors">
                        {product.category === 'Weight Loss' && <Scale size={28} />}
                        {product.category === 'Diabetes' && <Droplets size={28} />}
                        {product.category === 'Nutraceuticals' && <Pill size={28} />}
                        {product.category === 'General Health' && <Heart size={28} />}
                        {product.category === "Men's Health" && <User size={28} />}
                        {product.category === "Women's Health" && <User size={28} className="text-pink-400" />}
                        {product.category === 'Skin Care' && <Sparkles size={28} />}
                        {product.category === 'Dental Care' && <Smile size={28} />}
                        {product.category === 'Mental Health' && <Brain size={12} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">{product.name}</h3>
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                            {product.category === 'Weight Loss' ? t.weightLoss : 
                             product.category === 'Diabetes' ? t.diabetes : 
                             product.category === 'Nutraceuticals' ? t.nutraceuticals : 
                             product.category === 'General Health' ? t.generalHealth :
                             product.category === "Men's Health" ? t.mensHealth :
                             product.category === "Women's Health" ? t.womensHealth :
                             product.category === 'Skin Care' ? t.skinCare :
                             product.category === 'Dental Care' ? t.dentalCare : t.mentalHealth}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{product.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900 dark:text-white">${product.price}</p>
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{product.commission}% {t.commShort}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className={cn(
                          "px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1",
                          product.trend === 'up' ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : 
                          product.trend === 'down' ? "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400"
                        )}>
                          {product.trend === 'up' && <TrendingUp size={12} />}
                          {product.trend.toUpperCase()}
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{t.gravity.toUpperCase()}: {product.gravity}</p>
                        
                        <button
                          onClick={(e) => toggleCompare(e, product.id)}
                          className={cn(
                            "mt-1 p-1.5 rounded-lg border transition-all",
                            compareIds.includes(product.id)
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-emerald-500 hover:text-emerald-500"
                          )}
                          title={t.compare}
                        >
                          <Shuffle size={14} />
                        </button>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="py-20 text-center text-slate-400">
                    {t.noProducts}
                  </div>
                )}
              </div>
            </div>

            {/* Market Insights */}
            {data && !loading && (
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 dark:text-white">
                  <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={20} />
                  {t.marketInsights}
                </h3>
                <div className="prose prose-slate dark:prose-invert max-w-none text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  <div className="markdown-body">
                    <Markdown>{data.marketInsights}</Markdown>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Details and Charts */}
          <div className="space-y-6 min-w-0">
            {/* Sales Volume Comparison Chart */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm min-h-[450px] relative transition-colors">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t.salesComparison}</h3>
                <button 
                  onClick={() => setShowChartSettings(!showChartSettings)}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    showChartSettings ? "bg-slate-100 dark:bg-slate-800 text-emerald-600" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <Activity size={16} />
                </button>
              </div>

              <AnimatePresence>
                {showChartSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-slate-50 dark:bg-slate-800 rounded-xl mb-4 border border-slate-100 dark:border-slate-700"
                  >
                    <div className="p-4 space-y-4">
                      {['volume', 'gravity', 'commission'].map(m => (
                        <div key={m} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox" 
                              checked={visibleMetrics.has(m)}
                              onChange={() => toggleMetric(m)}
                              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                            />
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{t[m as keyof typeof t]}</span>
                          </div>
                          <div className="flex bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
                            {(['bar', 'line', 'area'] as const).map(type => (
                              <button
                                key={type}
                                onClick={() => updateMetricType(m, type)}
                                className={cn(
                                  "px-2 py-1 rounded text-[8px] font-bold uppercase transition-all",
                                  metricTypes[m] === type ? "bg-slate-900 dark:bg-slate-700 text-white" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                )}
                              >
                                {t[type as keyof typeof t]}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="h-[350px] w-full relative">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" debounce={1}>
                    <ComposedChart data={chartData} layout="vertical" margin={{ left: 0, right: 30, top: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={darkMode ? "#1e293b" : "#f1f5f9"} />
                      <XAxis type="number" xAxisId="vol" hide />
                      <XAxis type="number" xAxisId="pct" domain={[0, 100]} hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={100} 
                        fontSize={10} 
                        tick={{ fill: darkMode ? '#94a3b8' : '#64748b' }} 
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        cursor={{ fill: darkMode ? '#1e293b' : '#f8fafc' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg">
                                <p className="text-xs font-bold text-slate-900 dark:text-white mb-2">{data.fullName}</p>
                                <div className="space-y-1">
                                  {visibleMetrics.has('volume') && (
                                    <p className="text-[10px] flex justify-between gap-4">
                                      <span className="text-slate-500 dark:text-slate-400">{t.volume}:</span>
                                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{data.volume} {t.unitsPerMonth}</span>
                                    </p>
                                  )}
                                  {visibleMetrics.has('gravity') && (
                                    <p className="text-[10px] flex justify-between gap-4">
                                      <span className="text-slate-500 dark:text-slate-400">{t.gravity}:</span>
                                      <span className="font-bold text-blue-600 dark:text-blue-400">{data.gravity}</span>
                                    </p>
                                  )}
                                  {visibleMetrics.has('commission') && (
                                    <p className="text-[10px] flex justify-between gap-4">
                                      <span className="text-slate-500 dark:text-slate-400">{t.commission}:</span>
                                      <span className="font-bold text-amber-600 dark:text-amber-400">{data.commission}%</span>
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend verticalAlign="top" align="right" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: darkMode ? '#94a3b8' : '#64748b' }} />
                      
                      {/* Dynamic Metric Rendering */}
                      {visibleMetrics.has('volume') && (
                        metricTypes.volume === 'bar' ? (
                          <Bar xAxisId="vol" dataKey="volume" name={t.volume} radius={[0, 4, 4, 0]} barSize={12}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-vol-${index}`} fill={index === 0 ? '#059669' : '#10b981'} />
                            ))}
                          </Bar>
                        ) : metricTypes.volume === 'line' ? (
                          <Line xAxisId="vol" type="monotone" dataKey="volume" name={t.volume} stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} />
                        ) : (
                          <Area xAxisId="vol" type="monotone" dataKey="volume" name={t.volume} stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                        )
                      )}

                      {visibleMetrics.has('gravity') && (
                        metricTypes.gravity === 'bar' ? (
                          <Bar xAxisId="pct" dataKey="gravity" name={t.gravity} radius={[0, 4, 4, 0]} barSize={8} fill="#3b82f6" opacity={0.6} />
                        ) : metricTypes.gravity === 'line' ? (
                          <Line xAxisId="pct" type="monotone" dataKey="gravity" name={t.gravity} stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
                        ) : (
                          <Area xAxisId="pct" type="monotone" dataKey="gravity" name={t.gravity} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                        )
                      )}

                      {visibleMetrics.has('commission') && (
                        metricTypes.commission === 'bar' ? (
                          <Bar xAxisId="pct" dataKey="commission" name={t.commission} radius={[0, 4, 4, 0]} barSize={8} fill="#f59e0b" opacity={0.7} />
                        ) : metricTypes.commission === 'line' ? (
                          <Line xAxisId="pct" type="monotone" dataKey="commission" name={t.commission} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b', strokeWidth: 2 }} />
                        ) : (
                          <Area xAxisId="pct" type="monotone" dataKey="commission" name={t.commission} stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
                        )
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-300 text-xs italic">
                    {t.noProducts}
                  </div>
                )}
              </div>
            </div>

            {/* Product Details Sidebar */}
            <AnimatePresence mode="wait">
              {selectedProduct ? (
                <motion.div 
                  key={selectedProduct.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden sticky top-24 transition-colors"
                >
                  <div className="bg-emerald-600 dark:bg-emerald-700 p-6 text-white transition-colors">
                    <h2 className="text-xl font-bold mb-1">{selectedProduct.name}</h2>
                    <p className="text-emerald-100 dark:text-emerald-200 text-xs font-medium uppercase tracking-widest">
                      {selectedProduct.category === 'Weight Loss' ? t.weightLoss : 
                       selectedProduct.category === 'Diabetes' ? t.diabetes : 
                       selectedProduct.category === 'Nutraceuticals' ? t.nutraceuticals : 
                       selectedProduct.category === 'General Health' ? t.generalHealth :
                       selectedProduct.category === "Men's Health" ? t.mensHealth :
                       selectedProduct.category === "Women's Health" ? t.womensHealth :
                       selectedProduct.category === 'Skin Care' ? t.skinCare :
                       selectedProduct.category === 'Dental Care' ? t.dentalCare : t.mentalHealth}
                    </p>
                  </div>
                    <div className="p-6 space-y-6 text-slate-900 dark:text-white">
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">{t.overview}</h4>
                        <div className={cn(
                          "text-sm text-slate-600 dark:text-slate-400 leading-relaxed",
                          !expandedDesc && selectedProduct.description.length > 200 && "line-clamp-4"
                        )}>
                          <div className="markdown-body">
                            <Markdown>{selectedProduct.description}</Markdown>
                          </div>
                        </div>
                        {selectedProduct.description.length > 200 && (
                          <button 
                            onClick={() => setExpandedDesc(!expandedDesc)}
                            className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors uppercase tracking-wider"
                          >
                            {expandedDesc ? t.readLess : t.readMore}
                          </button>
                        )}
                      </div>

                    {/* Sparkline Trend Chart */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-transparent dark:border-slate-800">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.trendTitle}</h4>
                        <div className="flex items-center gap-2">
                          {['volume', 'gravity', 'commission'].map(m => (
                            <button
                              key={m}
                              onClick={() => toggleTrendMetric(m)}
                              className={cn(
                                "text-[8px] font-black px-1.5 py-0.5 rounded transition-all uppercase",
                                visibleTrendMetrics.has(m) 
                                  ? m === 'volume' ? "bg-emerald-600 text-white" : m === 'gravity' ? "bg-blue-600 text-white" : "bg-amber-500 text-white"
                                  : "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-300"
                              )}
                            >
                              {t[m as keyof typeof t].substring(0, 3)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="h-24 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trendData}>
                            <defs>
                              <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorComm" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Tooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-slate-900 dark:bg-black text-white p-2 rounded text-[8px] shadow-lg border border-slate-800">
                                      <p className="font-bold border-b border-slate-700 mb-1 pb-1">{payload[0].payload.period}</p>
                                      {payload.map((entry, index) => (
                                        <p key={index} style={{ color: entry.color || entry.stroke }}>
                                          {entry.name}: {entry.value}{entry.name === t.commission ? '%' : ''}
                                        </p>
                                      ))}
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            {visibleTrendMetrics.has('volume') && (
                              <Area 
                                type="monotone" 
                                dataKey="volume" 
                                name={t.volume}
                                stroke="#10b981" 
                                fillOpacity={1} 
                                fill="url(#colorVol)" 
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                            )}
                            {visibleTrendMetrics.has('gravity') && (
                              <Area 
                                type="monotone" 
                                dataKey="gravity" 
                                name={t.gravity}
                                stroke="#3b82f6" 
                                fill="transparent" 
                                strokeWidth={1.5}
                                strokeDasharray="4 2"
                                isAnimationActive={false}
                              />
                            )}
                            {visibleTrendMetrics.has('commission') && (
                              <Area 
                                type="monotone" 
                                dataKey="commission" 
                                name={t.commission}
                                stroke="#f59e0b" 
                                fillOpacity={1}
                                fill="url(#colorComm)"
                                strokeWidth={1.5}
                                isAnimationActive={false}
                              />
                            )}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="mt-4 flex bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 transition-colors">
                        {(['1w', '1q', '6m', '12m'] as const).map(tf => (
                          <button
                            key={tf}
                            onClick={() => setTrendTimeframe(tf)}
                            className={cn(
                              "flex-1 py-1 rounded text-[8px] font-bold uppercase transition-all whitespace-nowrap px-1",
                              trendTimeframe === tf ? "bg-slate-900 dark:bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                          >
                            {tf === '1w' ? t.lastWeek.split(' ')[1] : tf === '1q' ? t.lastQuarter.split(' ')[1] : tf === '6m' ? '6M' : '12M'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-transparent dark:border-slate-800 transition-colors">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">{t.price}</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white transition-colors">${selectedProduct.price}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-transparent dark:border-slate-800 transition-colors">
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">{t.commission}</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 transition-colors">{selectedProduct.commission}%</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-2 flex items-center gap-1 transition-colors">
                          <TrendingUp size={14} /> {t.pros}
                        </h4>
                        <ul className="space-y-1.5">
                          {selectedProduct.pros.map((pro, i) => (
                            <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2 transition-colors">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1 flex-shrink-0" />
                              {pro}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-rose-500 dark:text-rose-400 uppercase mb-2 flex items-center gap-1 transition-colors">
                          <Activity size={14} /> {t.cons}
                        </h4>
                        <ul className="space-y-1.5">
                          {selectedProduct.cons.map((con, i) => (
                            <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2 transition-colors">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-300 mt-1 flex-shrink-0" />
                              {con}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <button className="w-full bg-slate-900 dark:bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-slate-800 dark:hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                      {t.viewAffiliate}
                      <ExternalLink size={16} />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 flex flex-col items-center gap-4 transition-colors">
                  <Activity size={48} className="opacity-20" />
                  <p className="text-sm font-medium">{t.selectProduct}</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-8 px-6 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-400 dark:text-slate-500 text-xs">{t.footerText}</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Privacy Policy</a>
            <a href="#" className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Terms of Service</a>
            <a href="#" className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>

      {/* Comparison Floating Bar */}
      <AnimatePresence>
        {compareIds.length > 0 && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-slate-800 border border-slate-800 dark:border-slate-700 rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-6 z-[60] transition-colors"
          >
            <div className="flex items-center gap-3">
              {comparedProducts.map(p => (
                <div key={p.id} className="relative group/pill">
                  <div className="bg-slate-800 dark:bg-slate-900 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-200 flex items-center gap-2 transition-colors">
                    {p.name.substring(0, 10)}...
                    <button 
                      onClick={(e) => toggleCompare(e, p.id)}
                      className="text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {compareIds.length < 3 && (
                <div className="w-24 h-8 rounded-lg border-2 border-dashed border-slate-700 flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  {compareIds.length}/3
                </div>
              )}
            </div>
            
            <div className="h-8 w-px bg-slate-700" />
            
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setCompareIds([])}
                className="text-xs font-bold text-slate-400 hover:text-slate-200 uppercase tracking-wider"
              >
                {t.clearCompare}
              </button>
              <button 
                onClick={() => setShowComparison(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl font-bold text-xs shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2"
              >
                <Shuffle size={14} />
                {t.comparisonView}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comparison Modal */}
      <AnimatePresence>
        {showComparison && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm p-4 md:p-12 overflow-y-auto"
          >
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-extrabold text-white mb-2">{t.comparisonView}</h2>
                  <div className="flex items-center gap-4">
                    <p className="text-slate-400 text-sm">{t.maxCompare}</p>
                    <button 
                      onClick={() => setShowComparisonSettings(!showComparisonSettings)}
                      className={cn(
                        "text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border transition-all",
                        showComparisonSettings ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-700 text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {t.customizeComparison}
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => setShowComparison(false)}
                  className="p-3 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <AnimatePresence>
                {showComparisonSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-slate-900/50 backdrop-blur-md rounded-2xl mb-8 border border-slate-800"
                  >
                    <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                      {['price', 'commission', 'gravity', 'volume', 'trend', 'descLength', 'prosConsCount', 'trendStability'].map(metric => (
                        <button
                          key={metric}
                          onClick={() => toggleComparisonMetric(metric)}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                            visibleComparisonMetrics.has(metric) 
                              ? "bg-slate-800 border-emerald-600/50 text-white" 
                              : "border-slate-800 text-slate-500 hover:bg-slate-800/50"
                          )}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider">{t[metric as keyof typeof t]}</span>
                          {visibleComparisonMetrics.has(metric) && <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {comparedProducts.map((product) => (
                  <motion.div 
                    key={product.id}
                    layoutId={`compare-${product.id}`}
                    className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl transition-colors"
                  >
                    <div className="bg-slate-900 dark:bg-black p-6 text-white h-32 flex flex-col justify-end transition-colors">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">{product.category}</span>
                      <h3 className="text-xl font-bold line-clamp-2">{product.name}</h3>
                    </div>
                    
                    <div className="p-8 space-y-8">
                      {/* Comparison Points */}
                      <div className="space-y-6">
                        {visibleComparisonMetrics.has('price') && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.price}</span>
                            <span className="text-2xl font-black text-slate-900 dark:text-white">${product.price}</span>
                          </div>
                        )}
                        {visibleComparisonMetrics.has('commission') && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.commission}</span>
                            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{product.commission}%</span>
                          </div>
                        )}
                        {visibleComparisonMetrics.has('gravity') && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.gravity}</span>
                            <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{product.gravity}</span>
                          </div>
                        )}
                        {visibleComparisonMetrics.has('volume') && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.volume}</span>
                            <div className="text-right">
                              <span className="text-xl font-black text-slate-900 dark:text-white block">{product.salesVolume}</span>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{t.unitsPerMonth}</span>
                            </div>
                          </div>
                        )}
                        {visibleComparisonMetrics.has('trend') && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.marketTrend}</span>
                            <div className={cn(
                              "px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 transition-colors",
                              product.trend === 'up' ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" : 
                              product.trend === 'down' ? "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400"
                            )}>
                              {product.trend === 'up' && <TrendingUp size={14} />}
                              {product.trend.toUpperCase()}
                            </div>
                          </div>
                        )}
                        {visibleComparisonMetrics.has('descLength') && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.descLength}</span>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 transition-colors">{product.description.length} {t.chars}</span>
                          </div>
                        )}
                        {visibleComparisonMetrics.has('prosConsCount') && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.prosConsCount}</span>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 transition-colors">{product.pros.length + product.cons.length} {t.items}</span>
                          </div>
                        )}
                        {visibleComparisonMetrics.has('trendStability') && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t.trendStability}</span>
                            <div className="flex items-center gap-1">
                              {(() => {
                                const score = calculateStabilityScore(product, trendTimeframe);
                                return (
                                  <>
                                    <div className="flex gap-0.5 mr-2">
                                      {[1, 2, 3, 4, 5].map((s) => (
                                        <div 
                                          key={s} 
                                          className={cn(
                                            "w-2 h-2 rounded-full",
                                            s <= score ? "bg-blue-500" : "bg-slate-200 dark:bg-slate-700"
                                          )} 
                                        />
                                      ))}
                                    </div>
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors">{score}/5</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="h-px bg-slate-100" />

                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.overview}</h4>
                        <p className="text-sm text-slate-600 leading-relaxed line-clamp-4 italic">"{product.description}"</p>
                      </div>

                      <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2">
                        {t.viewAffiliate}
                        <ExternalLink size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
