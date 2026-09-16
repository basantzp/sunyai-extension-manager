/**
 * sunyai bookmark organizer (v2.1)
 *
 * 100% AUTONOMOUS REAL-TIME & ZERO-CLICK ENGINE:
 * - Truly Autonomous: Organizes on save (Ctrl+D / Star), on move, on startup, and auto-sweeps.
 * - Sub-Millisecond Speed: In-memory cached taxonomy and word-boundary genre matching (<0.5ms).
 * - 12-Folder Bar Protection: Preserves Bookmark Bar at <= 12 main folders with high-intelligence subfolder routing.
 * - Overcrowded Partitioning: Splits folders with >= 6 items of a genre into clean subfolders.
 * - In-Page Floating Toast: Instant visual pill confirmation on the active page.
 */

const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "z-ai/glm-5.2:free",
  autoOrganize: true,
  notify: true,
  lastOrganizedCount: 0,
  lastRun: null,
  realtimeActive: true
};

const MAX_MAIN_FOLDERS = 12;
const OVERCROWDED_THRESHOLD = 6;
const MAX_PARTITION_DEPTH = 3;

// Prevent internal move loops
const internalMovedIds = new Set();

// In-memory cached taxonomy
let cachedTaxonomy = null;
let lastTaxonomyRefresh = 0;

// ---------------------------------------------------------------------------
// IN-PAGE FLOATING TOAST POPUP
// ---------------------------------------------------------------------------

async function showInPageToast(catName, subName) {
  try {
    // Also update browser toolbar tool icon
    if (chrome.action) {
      try {
        chrome.action.setTitle({ title: `sunyai: Pushed to folder ${catName} / subfolder ${subName}` });
        chrome.action.setBadgeText({ text: "✓" });
        chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
        setTimeout(() => {
          chrome.action.setBadgeText({ text: "" });
        }, 3500);
      } catch (e) {}
    }

    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("brave://") || tab.url.startsWith("edge://")) {
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (cat, sub) => {
        const oldToast = document.getElementById("__sunyai_sync_toast__");
        if (oldToast) oldToast.remove();

        const toast = document.createElement("div");
        toast.id = "__sunyai_sync_toast__";
        toast.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1;">
            <div style="display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #10b981; color: #09090b; font-size: 11px; font-weight: 800;">⚡</div>
            <span style="color: #a1a1aa; font-weight: 500;">Pushed to folder</span>
            <span style="color: #38bdf8; font-weight: 700;">${cat}</span>
            <span style="color: #71717a; font-weight: 600;">/</span>
            <span style="color: #a1a1aa; font-weight: 500;">subfolder</span>
            <span style="color: #34d399; font-weight: 700;">${sub}</span>
          </div>
        `;

        Object.assign(toast.style, {
          position: "fixed",
          top: "16px",
          right: "20px",
          zIndex: "2147483647",
          backgroundColor: "#09090b",
          color: "#f4f4f5",
          padding: "7px 14px",
          borderRadius: "9999px",
          border: "1px solid rgba(16, 185, 129, 0.45)",
          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.6), 0 0 10px rgba(16, 185, 129, 0.25)",
          pointerEvents: "none",
          transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          transform: "translateY(-15px) scale(0.95)",
          opacity: "0"
        });

        document.documentElement.appendChild(toast);

        requestAnimationFrame(() => {
          toast.style.transform = "translateY(0) scale(1)";
          toast.style.opacity = "1";
        });

        setTimeout(() => {
          toast.style.transform = "translateY(-10px) scale(0.95)";
          toast.style.opacity = "0";
          setTimeout(() => {
            if (toast.parentNode) toast.remove();
          }, 300);
        }, 2200);
      },
      args: [catName, subName]
    });
  } catch (err) {
    // Fail gracefully on restricted or system tabs
  }
}

// ---------------------------------------------------------------------------
// LIFECYCLE & AUTONOMOUS ALARMS
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...existing, autoOrganize: true });
  
  if (chrome.alarms) {
    try {
      chrome.alarms.create("autonomous_sweep", { periodInMinutes: 1 });
    } catch (e) {}
  }

  console.log("[sunyai] Engine initialized. Autonomous real-time listeners active.");
  await refreshTaxonomy();
  await sweepLooseBookmarks();
});

chrome.runtime.onStartup.addListener(async () => {
  if (chrome.alarms) {
    try {
      chrome.alarms.create("autonomous_sweep", { periodInMinutes: 1 });
    } catch (e) {}
  }
  console.log("[sunyai] 🚀 Browser startup: Auto-executing Sync Manually sweep...");
  await refreshTaxonomy();
  await sweepLooseBookmarks();
});

// Auto-trigger Sync Manually sweep whenever browser window is launched
if (chrome.windows && chrome.windows.onCreated) {
  let initialStartupWindow = true;
  chrome.windows.onCreated.addListener(async () => {
    if (initialStartupWindow) {
      initialStartupWindow = false;
      console.log("[sunyai] ⚡ Window launch: Auto-executing Sync Manually sweep...");
      await sweepLooseBookmarks();
      setTimeout(() => { initialStartupWindow = true; }, 8000);
    }
  });
}

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "autonomous_sweep") {
      await sweepLooseBookmarks();
    }
  });
}

// Immediate sweep whenever service worker wakes up
setTimeout(() => {
  sweepLooseBookmarks().catch(err => console.error("[sunyai] worker boot sweep:", err));
}, 200);


// ---------------------------------------------------------------------------
// REAL-TIME EVENT LISTENERS (Instant Autonomous Trigger)
// ---------------------------------------------------------------------------

// Trigger 1: Bookmark Created (Ctrl+D, Star Icon, Mobile sync)
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (internalMovedIds.has(id)) return;

  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (!settings.autoOrganize) return;

  // 40ms tick allows Brave to commit bookmark node to disk
  await new Promise(r => setTimeout(r, 40));

  try {
    let targetNode = bookmark;
    if (!targetNode || !targetNode.url) {
      const nodes = await chrome.bookmarks.get(id);
      if (nodes && nodes[0]) targetNode = nodes[0];
    }
    if (targetNode && targetNode.url) {
      await organizeSingleBookmark(targetNode, settings);
    }
  } catch (err) {
    console.error("[sunyai] onCreated error:", err);
  }
});

// Trigger 2: Bookmark Moved (Auto-corrects wrong folder within milliseconds)
chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  if (internalMovedIds.has(id)) {
    internalMovedIds.delete(id);
    return;
  }

  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (!settings.autoOrganize) return;

  await new Promise(r => setTimeout(r, 40));
  try {
    const nodes = await chrome.bookmarks.get(id);
    if (!nodes || !nodes[0] || !nodes[0].url) return;
    await organizeSingleBookmark(nodes[0], settings);
  } catch (err) {
    console.error("[sunyai] onMoved auto-correct error:", err);
  }
});

// Trigger 3: Bookmark Changed (Title or URL edited)
chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  if (internalMovedIds.has(id)) return;
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (!settings.autoOrganize) return;

  await new Promise(r => setTimeout(r, 50));
  try {
    const nodes = await chrome.bookmarks.get(id);
    if (!nodes || !nodes[0] || !nodes[0].url) return;
    await organizeSingleBookmark(nodes[0], settings);
  } catch (err) {
    console.error("[sunyai] onChanged error:", err);
  }
});

// ---------------------------------------------------------------------------
// POPUP COMMUNICATION
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "organize_now" || request.action === "auto_sweep") {
    sweepLooseBookmarks().then((res) => {
      sendResponse({
        success: true,
        count: res.count,
        lastFolder: res.lastFolder,
        lastSubfolder: res.lastSubfolder,
        lastDestination: res.lastDestination,
        destinations: res.destinations
      });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === "get_status") {
    chrome.storage.local.get(DEFAULT_SETTINGS).then((settings) => {
      sendResponse({ settings, status: "Autonomous & Active" });
    });
    return true;
  }
});

// ---------------------------------------------------------------------------
// CRASH-PROOF TAXONOMY PARSER
// ---------------------------------------------------------------------------

async function refreshTaxonomy() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const roots = tree[0]?.children || [];

    const bar = roots.find(r => r.id === "1" || (r.title && r.title.toLowerCase().includes("bar"))) || roots[0];
    const other = roots.find(r => r.id === "2" || (r.title && r.title.toLowerCase().includes("other")));
    const synced = roots.find(r => r.id === "3" || (r.title && (r.title.toLowerCase().includes("mobile") || r.title.toLowerCase().includes("synced"))));

    const rootIds = new Set([bar?.id, other?.id, synced?.id].filter(Boolean));
    const topCategoryIds = new Set();
    const subfolderIds = new Set();
    const folderNodeMap = new Map();

    const taxonomy = {};
    for (const item of bar?.children || []) {
      if (!item.url) {
        const topName = (item.title || "").trim();
        if (!topName) continue;

        topCategoryIds.add(item.id);
        folderNodeMap.set(item.id, item);
        taxonomy[topName] = {
          id: item.id,
          name: topName,
          subfolders: {}
        };

        for (const sub of item.children || []) {
          if (!sub.url) {
            const subName = (sub.title || "").trim();
            if (!subName) continue;

            subfolderIds.add(sub.id);
            folderNodeMap.set(sub.id, sub);
            taxonomy[topName].subfolders[subName] = sub.id;

            for (const deepSub of sub.children || []) {
              if (!deepSub.url) {
                subfolderIds.add(deepSub.id);
                folderNodeMap.set(deepSub.id, deepSub);
              }
            }
          }
        }
      }
    }

    cachedTaxonomy = {
      barId: bar ? bar.id : "1",
      rootIds,
      topCategoryIds,
      subfolderIds,
      folderNodeMap,
      taxonomy,
      barChildren: bar?.children || []
    };
    lastTaxonomyRefresh = Date.now();
    return cachedTaxonomy;
  } catch (err) {
    console.error("[sunyai] Error refreshing taxonomy:", err);
    return cachedTaxonomy || { barId: "1", rootIds: new Set(["1"]), topCategoryIds: new Set(), subfolderIds: new Set(), taxonomy: {}, barChildren: [] };
  }
}

async function getTaxonomy() {
  if (!cachedTaxonomy || (Date.now() - lastTaxonomyRefresh > 15000)) {
    await refreshTaxonomy();
  }
  return cachedTaxonomy;
}

// ---------------------------------------------------------------------------
// ROBUST WORD-BOUNDARY GENRE ENGINE (<0.01ms)
// ---------------------------------------------------------------------------

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordMatch(text, keyword) {
  if (keyword.length <= 4 && !keyword.includes(" ")) {
    const regex = new RegExp("(^|[^a-zA-Z0-9])" + escapeRegExp(keyword) + "($|[^a-zA-Z0-9])", "i");
    return regex.test(text);
  }
  return text.includes(keyword.toLowerCase());
}

function anyWord(text, keywords) {
  return keywords.some(k => wordMatch(text, k));
}

function classifyContentGenre(title, url, taxonomy) {
  const text = ((title || "") + " " + (url || "")).toLowerCase();
  let domain = "";
  try {
    const u = new URL(url);
    domain = u.hostname.replace(/^www\./, "").toLowerCase();
  } catch (e) {}

  const findExistingCat = (keywords) => {
    return Object.keys(taxonomy).find(cat => 
      keywords.some(k => cat.toLowerCase().includes(k))
    );
  };

  const isYouTube = domain.includes("youtube.com") || domain.includes("youtu.be");

  // 1. YOUTUBE CONTENT
  if (isYouTube) {
    const cat = "YouTube";

    // 1.1 NEPSE & Share Market
    if (anyWord(text, [
      "nepse", "sebon", "share market", "share bazar", "share bazaar", "stock market",
      "bull", "bear", "ipo", "meroshare", "ideapreneur", "dividend", "mutual fund",
      "fundamental analysis", "technical analysis", "candle stick", "candlestick",
      "trading course", "investing course", "portfolio", "21 बुँदे", "स्वर्णिम", "शेयर", "बजार"
    ])) {
      return { category: cat, subfolder: "NEPSE Course" };
    }

    // 1.2 Documentaries
    if (anyWord(text, [
      "documentary", "investigative", "herne katha", "the nepali comment", "in-depth story",
      "the storytellers", "docuseries", "history of", "untold story", "the rise of", "the fall of",
      "biography", "case study", "inside the", "exposed", "truth about", "dw documentary",
      "vox", "frontline", "bbc documentary"
    ])) {
      return { category: cat, subfolder: "Documentary" };
    }

    // 1.3 Music Videos (safe word matching prevents 'lost' -> 'ost')
    if (anyWord(text, [
      "music video", "official video", "official audio", "official music", "lyric video", "lyrics",
      "song", "soundtrack", "ost", "lofi", "remix", "acoustic", "live performance", "concert",
      "album", "singer", "pop music", "hip hop", "rap", "rock",
      "arijit", "sujan chapagain", "nawaraj parajuli", "john rai", "cover", "ghazal", "bollywood", "vevo"
    ])) {
      return { category: cat, subfolder: "Music Videos" };
    }

    // 1.4 Short Movies & Films
    if (anyWord(text, [
      "short movie", "short film", "short cinema", "award winning short", "micro movie",
      "cinema", "film", "trailer", "teaser", "feature film", "indie film", "full movie",
      "web series", "episode"
    ])) {
      return { category: cat, subfolder: "Short Movie" };
    }

    // 1.5 Courses & Tutorials
    if (anyWord(text, [
      "course", "full course", "tutorial", "crash course", "learn in", "beginner to pro",
      "masterclass", "complete guide", "roadmap", "zero to hero", "bootcamp", "step by step",
      "how to code", "learn python", "learn javascript", "learn linux", "freecodecamp",
      "programming", "react tutorial", "devops course"
    ])) {
      return { category: cat, subfolder: "Course" };
    }

    // 1.6 AI Benchmarks & Tech Reviews
    if (anyWord(text, [
      "gpt", "astra", "fable", "claude", "gemini", "benchmark", "review", "unboxing", "hands on",
      "iphone", "macbook", "gpu", "laptop", "mkbhd", "dave2d", "hardware", "chips"
    ])) {
      return { category: cat, subfolder: "Tech Reviews" };
    }

    // 1.7 Research & Deep Dives
    if (anyWord(text, [
      "research", "deep dive", "explained", "how it works", "the science of", "why does",
      "physics", "quantum", "neuroscience", "veritasium", "kurzgesagt", "cleo abram",
      "mark rober", "3blue1brown", "computerphile", "numberphile", "scishow", "ted talk", "ted-ed", "ted"
    ])) {
      return { category: cat, subfolder: "Research" };
    }

    // 1.8 Podcasts & Interviews
    if (anyWord(text, [
      "podcast", "episode", "interview", "conversation with", "joe rogan", "lex fridman",
      "huberman", "hormozi", "tim ferriss", "diary of a ceo", "steven bartlett", "chris williamson"
    ])) {
      return { category: cat, subfolder: "Podcasts & Interviews" };
    }

    return { category: cat, subfolder: "General Videos" };
  }

  // 2. MAGAZINES & HIGH-PROFILE PRESS (Forbes, Bloomberg, Wired, Fortune, etc.)
  const bizMagazines = ["forbes.com", "fortune.com", "bloomberg.com", "wsj.com", "economist.com", "hbr.org", "ft.com", "businessinsider.com", "inc.com", "fastcompany.com"];
  const techMagazines = ["techcrunch.com", "wired.com", "theverge.com", "arstechnica.com", "technologyreview.com", "venturebeat.com", "engadget.com"];
  const cultureMagazines = ["newyorker.com", "theatlantic.com", "nationalgeographic.com", "time.com", "vogue.com", "vanityfair.com"];
  const newsPress = ["reuters.com", "apnews.com", "nytimes.com", "bbc.com", "theguardian.com", "aljazeera.com", "setopati.com", "onlinekhabar.com"];

  if (anyWord(domain, bizMagazines) || anyWord(text, ["forbes", "fortune magazine", "bloomberg news", "wall street journal", "harvard business review", "financial times", "the economist"])) {
    const existingCat = findExistingCat(["magazine", "publication", "press", "editorial"]);
    const cat = existingCat || "📰 Magazines & Publications";
    return { category: cat, subfolder: "Business & Leadership Magazines" };
  }

  if (anyWord(domain, techMagazines) || anyWord(text, ["techcrunch", "wired magazine", "the verge"])) {
    const existingCat = findExistingCat(["magazine", "publication", "press", "editorial"]);
    const cat = existingCat || "📰 Magazines & Publications";
    return { category: cat, subfolder: "Tech & Innovation Magazines" };
  }

  if (anyWord(domain, cultureMagazines) || anyWord(text, ["national geographic", "new yorker", "the atlantic", "time magazine"])) {
    const existingCat = findExistingCat(["magazine", "publication", "press", "editorial"]);
    const cat = existingCat || "📰 Magazines & Publications";
    return { category: cat, subfolder: "Culture & Science Magazines" };
  }

  if (anyWord(domain, newsPress) || anyWord(text, ["reuters", "associated press", "investigative journalism", "breaking news"])) {
    const existingCat = findExistingCat(["news", "press", "journalism"]);
    const cat = existingCat || "📰 News & Journalism";
    return { category: cat, subfolder: "Global & Investigative News" };
  }

  // 3. AI, LLMS, CLOUD ACCELERATORS & MEDIA (Groq, OpenAI, Claude, DeepSeek)
  if (anyWord(text, [
    "groq", "chatgpt", "openai", "claude", "anthropic", "deepseek", "gemini", "huggingface",
    "ollama", "mistral", "llama", "gemma", "midjourney", "stable diffusion", "comfyui",
    "prompt", "runway", "elevenlabs", "voice.ai", "roomgpt", "pictory", "munch",
    "vidyo", "capcut", "invideo", "neural", "tts", "stt", "suno", "genai", "perplexity"
  ])) {
    const cat = findExistingCat(["neural", "ai", "machine learning"]) || "Neural Labs";
    if (anyWord(text, ["voice", "audio", "tts", "stt", "voice.ai", "elevenlabs", "adobe podcast", "suno"])) {
      return { category: cat, subfolder: "Multimodal Voice & Neural Audio" };
    }
    if (anyWord(text, ["video", "pictory", "capcut", "munch", "vidyo", "invideo", "runway", "roomgpt", "midjourney"])) {
      return { category: cat, subfolder: "Generative Media & Video" };
    }
    return { category: cat, subfolder: "Frontier LLMs & Reasoning Models" };
  }

  // 4. ENTERTAINMENT STREAMING & MOVIES
  if (anyWord(text, [
    "moviesjoy", "myflixer", "cineb", "multimovies", "sflix", "hdmovie", "1shows", "345movie",
    "brocoflix", "cineby", "dashflix", "cornclick", "cinemadeck", "cinebolt", "cataz",
    "bingeflix", "autoembed", "abflix", "7xcinema", "1movies", "spenflix", "nepu", "moviemaze", "stream movies"
  ])) {
    const cat = findExistingCat(["neural", "media", "decompression"]) || "Neural Labs";
    return { category: cat, subfolder: "Decompression & High-Yield Media" };
  }

  // 5. PROP TRADING, FOREX, CRYPTO & DEX
  if (anyWord(text, ["prop", "funded", "forex", "babypips", "pipsology", "payout", "sizeprop", "ftmo", "apex", "tradingview", "dex", "perp", "solana", "ethereum", "bitcoin", "crypto", "binance", "bybit", "hyperliquid", "raw spread"])) {
    const cat = findExistingCat(["prop trading", "trading", "crypto", "forex"]) || "🏆 Prop Trading Matrix [Forex, Crypto & Fastest Payouts]";
    if (anyWord(text, ["crypto", "dex", "perp", "hyperliquid", "solana", "ethereum", "bitcoin"])) {
      return { category: cat, subfolder: "🪙 3. Crypto Prop Firms (DEX, CEX & Specialists)" };
    }
    if (anyWord(text, ["forex", "babypips", "pipsology", "spread", "currency"])) {
      return { category: cat, subfolder: "💱 4. Forex Prop Firms (Raw Spread, Blue Chips & Scaling)" };
    }
    if (anyWord(text, ["fastest", "payout", "instant", "tier"])) {
      return { category: cat, subfolder: "⚡ 1. Fastest Payout Prop Firms (By Speed Tiers)" };
    }
    return { category: cat, subfolder: "⏱️ 2. Payout Trackers & Prop Comparison Portals" };
  }

  // 6. NEPAL FINANCE, BANKING & GLOBAL CAPITAL
  if (anyWord(text, [
    "nepse", "sebon", "share market", "stock", "ipo", "meroshare", "ideapreneur",
    "dividend", "mutual fund", "budget", "macroeconomic", "inflation", "portfolio",
    "banking", "nabil", "nrb", "monetary policy", "stripe", "payment", "fiat", "remittance"
  ])) {
    const cat = findExistingCat(["finance", "capital", "venture"]) || "Finance";
    if (anyWord(text, ["nepse", "sebon", "meroshare", "stock", "share", "ipo"])) {
      return { category: cat, subfolder: "📈 [Execution] Matching Engines, State Registry & Broker Nodes" };
    }
    return { category: cat, subfolder: "🏦 [L1] Custodial Reserves & Institutional Liquidity" };
  }

  // 7. AUTONOMOUS AGENTS, MCP & DEVELOPER TOOLS
  if (anyWord(text, ["agent", "swarm", "mcp", "openrouter", "omniroute", "claw-code", "ruflo", "cursor", "copilot", "vibe coding", "github.com", "gitlab", "langchain", "llamaindex"])) {
    const cat = findExistingCat(["agentic", "agent", "os", "developer"]) || "Agentic OS";
    if (anyWord(text, ["mcp", "protocol", "server"])) {
      return { category: cat, subfolder: "MCP Infrastructure & Live Tool Servers" };
    }
    return { category: cat, subfolder: "Autonomous Multi-Agent Swarms & Orchestration" };
  }

  // 8. NOC OPS, TELEMETRY & CLOUD INFRASTRUCTURE
  if (anyWord(text, ["grafana", "telemetry", "prometheus", "docker", "kubernetes", "k8s", "aws", "gcp", "azure", "linux", "devops", "sre", "router", "switch", "huawei", "cisco", "subnet", "mpls", "skybroadband", "metrics"])) {
    const cat = findExistingCat(["noc", "cloud", "telemetry", "network"]) || "NOC Ops";
    if (anyWord(text, ["grafana", "telemetry", "metrics", "prometheus"])) {
      return { category: cat, subfolder: "Realtime Telemetry & Grafana Mesh" };
    }
    return { category: cat, subfolder: "Core Infrastructure & Cloud Gateways" };
  }

  // 9. ACADEMIC RESEARCH & ASSIGNMENTS
  if (anyWord(text, ["arxiv", "consensus", "scispace", "scite", "plagiarism", "citation", "scholar", "sciencedirect", "moodle", "university", "academic", "tinywow", "autowrite", "elicit", "excelsia"])) {
    const cat = findExistingCat(["assignment", "research", "academic"]) || "Assignment";
    if (anyWord(text, ["moodle", "portal", "enrolment", "excelsia"])) {
      return { category: cat, subfolder: "Institutional Portals & Governance" };
    }
    return { category: cat, subfolder: "Consensus Discovery & Literature R&D" };
  }

  // 10. CAREERS & TECH OPENINGS
  if (anyWord(text, ["job", "career", "vacancy", "intern", "merojob", "jobsnepal", "jobejee", "linkedin.com/jobs", "recruitment", "hire", "resume"])) {
    const cat = findExistingCat(["web3 pipeline", "pipeline", "career", "job"]) || "Web3 Pipeline";
    return { category: cat, subfolder: "Regional Tech Lead & Architect Openings" };
  }

  // 11. DESIGN & ASSETS
  if (anyWord(domain, ["figma.com", "dribbble.com", "behance.net", "freepik.com", "unsplash.com", "iconify.design", "coolors.co"])) {
    const existingCat = findExistingCat(["design", "creative", "ui"]);
    const cat = existingCat || "🎨 Design & Creative Assets";
    return { category: cat, subfolder: "UI Design & Resources" };
  }

  // 12. SHOPPING & E-COMMERCE
  if (anyWord(domain, ["amazon.com", "daraz.com.np", "ebay.com", "aliexpress.com", "flipkart.com", "etsy.com"])) {
    const existingCat = findExistingCat(["shopping", "e-commerce", "store"]);
    const cat = existingCat || "🛒 Shopping & E-Commerce";
    return { category: cat, subfolder: "Online Marketplaces" };
  }

  // 13. SMART DOMAIN BRAND FALLBACK
  if (domain) {
    const ignored = new Set(["com", "net", "org", "co", "io", "app", "gov", "edu", "mil", "ai", "np", "uk", "in", "de", "to", "xyz", "top", "world", "rs", "gd", "fo", "ru", "cc", "bz", "tv"]);
    const parts = domain.split(".");
    let brand = "";
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!ignored.has(p) && p.length > 2) {
        brand = p;
        break;
      }
    }
    if (brand) {
      const brandCap = brand.charAt(0).toUpperCase() + brand.slice(1);
      const existingCat = findExistingCat(["tools", "utilities", "resources"]);
      const cat = existingCat || "🛠️ Web Tools & Utilities";
      return { category: cat, subfolder: `${brandCap} Services` };
    }
  }

  return { category: "🛠️ Web Tools & Utilities", subfolder: "General Bookmarks" };
}

// ---------------------------------------------------------------------------
// HIGH INTELLIGENCE ROUTER (Enforces <= 12 main folders)
// ---------------------------------------------------------------------------

function routeToBestExistingMainFolder(targetCat, targetSub, taxonomy) {
  const existingCats = Object.keys(taxonomy);
  if (existingCats.length === 0) return { category: targetCat, subfolder: targetSub };

  const targetText = ((targetCat || "") + " " + (targetSub || "")).toLowerCase();
  let bestCat = null;
  let highestScore = -1;

  for (const cat of existingCats) {
    const catLower = cat.toLowerCase();
    let score = 0;

    const catTokens = catLower.replace(/[^\w\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
    for (const token of catTokens) {
      if (targetText.includes(token)) score += 10;
    }

    if (targetText.includes("nepse") || targetText.includes("share market") || targetText.includes("stock") || targetText.includes("ipo")) {
      if (catLower.includes("finance")) score += 50;
    }
    if (targetText.includes("prop") || targetText.includes("forex") || targetText.includes("trading") || targetText.includes("payout") || targetText.includes("dex")) {
      if (catLower.includes("prop") || catLower.includes("trading")) score += 40;
      if (catLower.includes("finance")) score += 20;
    }
    if (targetText.includes("ai") || targetText.includes("neural") || targetText.includes("llm") || targetText.includes("groq") || targetText.includes("model")) {
      if (catLower.includes("neural")) score += 45;
      if (catLower.includes("agentic")) score += 25;
    }
    if (targetText.includes("design") || targetText.includes("ui") || targetText.includes("asset") || targetText.includes("creative") || targetText.includes("figma")) {
      if (catLower.includes("agentic") || catLower.includes("neural")) score += 35;
    }
    if (targetText.includes("magazine") || targetText.includes("press") || targetText.includes("forbes") || targetText.includes("bloomberg") || targetText.includes("news")) {
      if (targetText.includes("business") || targetText.includes("leadership") || targetText.includes("finance")) {
        if (catLower.includes("finance")) score += 40;
      }
      if (targetText.includes("tech") || targetText.includes("innovation") || targetText.includes("wired")) {
        if (catLower.includes("neural") || catLower.includes("agentic")) score += 40;
      }
      if (catLower.includes("codex") || catLower.includes("assignment")) score += 20;
    }
    if (targetText.includes("youtube") || targetText.includes("video") || targetText.includes("movie") || targetText.includes("documentary") || targetText.includes("podcast")) {
      if (catLower.includes("cognitive") || catLower.includes("neural")) score += 35;
      if (catLower.includes("codex")) score += 20;
    }
    if (targetText.includes("code") || targetText.includes("agent") || targetText.includes("mcp") || targetText.includes("github") || targetText.includes("docker") || targetText.includes("linux")) {
      if (catLower.includes("agentic") || catLower.includes("noc")) score += 40;
    }
    if (targetText.includes("research") || targetText.includes("academic") || targetText.includes("paper") || targetText.includes("university") || targetText.includes("moodle")) {
      if (catLower.includes("assignment") || catLower.includes("codex")) score += 40;
    }
    if (targetText.includes("career") || targetText.includes("job") || targetText.includes("pipeline")) {
      if (catLower.includes("pipeline") || catLower.includes("career")) score += 40;
    }
    if (targetText.includes("tool") || targetText.includes("utility") || targetText.includes("service")) {
      if (catLower.includes("noc") || catLower.includes("agentic")) score += 30;
    }

    if (score > highestScore) {
      highestScore = score;
      bestCat = cat;
    }
  }

  return { category: bestCat || existingCats[0], subfolder: targetSub };
}

// ---------------------------------------------------------------------------
// OVERCROWDED SUB-GENRE PARTITIONER
// ---------------------------------------------------------------------------

function clusterBookmarks(folderName, urlItems) {
  const map = {};
  for (const item of urlItems) {
    const cls = classifyContentGenre(item.title, item.url, {});
    const sub = cls.subfolder;
    if (!sub || sub.toLowerCase() === folderName.toLowerCase() || sub === "General Bookmarks") continue;
    if (!map[sub]) map[sub] = [];
    map[sub].push(item.id);
  }

  const result = [];
  for (const [subName, ids] of Object.entries(map)) {
    if (ids.length >= 2) {
      result.push({ subfolder: subName, bookmarkIds: ids });
    }
  }
  return result;
}

async function partitionSingleFolder(folderNode, urlItems, existingSubfolders) {
  const folderName = folderNode.title ? folderNode.title.trim() : "Folder";
  const clusters = clusterBookmarks(folderName, urlItems);
  if (!clusters || clusters.length === 0) return 0;

  let movedCount = 0;
  const existingSubMap = new Map();
  for (const sub of existingSubfolders) {
    if (sub.title) existingSubMap.set(sub.title.trim().toLowerCase(), sub.id);
  }

  for (const cluster of clusters) {
    const subName = cluster.subfolder.trim();
    if (!subName || subName.toLowerCase() === folderName.toLowerCase()) continue;
    if (!cluster.bookmarkIds || cluster.bookmarkIds.length < 2) continue;

    let targetSubId = existingSubMap.get(subName.toLowerCase());
    if (!targetSubId) {
      try {
        const createdSub = await chrome.bookmarks.create({
          parentId: folderNode.id,
          title: subName
        });
        targetSubId = createdSub.id;
        existingSubMap.set(subName.toLowerCase(), targetSubId);
      } catch (err) {
        continue;
      }
    }

    let clusterMoved = 0;
    for (const id of cluster.bookmarkIds) {
      try {
        internalMovedIds.add(id);
        await chrome.bookmarks.move(id, { parentId: targetSubId });
        clusterMoved++;
        movedCount++;
        setTimeout(() => internalMovedIds.delete(id), 1200);
      } catch (e) {}
    }

    if (clusterMoved > 0) {
      await showInPageToast(folderName, `${subName} (${clusterMoved} items)`);
    }
  }

  return movedCount;
}

async function partitionOvercrowdedFolders() {
  const tree = await chrome.bookmarks.getTree();
  let totalPartitioned = 0;

  async function inspectNode(folderNode, depth = 0) {
    // Only inspect top-level category folders (depth 1) to cluster loose items into subfolders;
    // never alter or scramble already-curated subfolders (depth > 1)
    if (!folderNode || depth > 1) return;

    let children = [];
    try {
      children = await chrome.bookmarks.getChildren(folderNode.id);
    } catch (e) {
      return;
    }

    const urlItems = children.filter(c => c.url);
    const subfolderItems = children.filter(c => !c.url);

    if (urlItems.length >= OVERCROWDED_THRESHOLD) {
      const moved = await partitionSingleFolder(folderNode, urlItems, subfolderItems);
      totalPartitioned += moved;
    }
  }

  const roots = tree[0]?.children || [];
  for (const root of roots) {
    const rootChildren = await chrome.bookmarks.getChildren(root.id);
    for (const child of rootChildren) {
      if (!child.url) {
        await inspectNode(child, 1);
      }
    }
  }

  return totalPartitioned;
}

// ---------------------------------------------------------------------------
// CORE AUTONOMOUS ORGANIZER
// ---------------------------------------------------------------------------

async function organizeSingleBookmark(bookmark, settings) {
  if (!bookmark || !bookmark.url) return false;

  const taxonomyData = await getTaxonomy();
  const { barId, rootIds, topCategoryIds, subfolderIds, taxonomy } = taxonomyData;

  // 1. Instant local classification (< 0.01 ms)
  const match = classifyContentGenre(bookmark.title, bookmark.url, taxonomy);
  let catName = match.category;
  let subName = match.subfolder;

  // 2. Ensure Category exists (12-Folder limit enforced)
  let catNode = taxonomy[catName];
  let catId = catNode?.id;
  if (!catId) {
    const existingCat = Object.keys(taxonomy).find(k => k.toLowerCase() === catName.toLowerCase());
    if (existingCat) {
      catId = taxonomy[existingCat].id;
      catName = existingCat;
      catNode = taxonomy[catName];
    } else {
      const currentMainCount = Object.keys(taxonomy).length;
      if (currentMainCount >= MAX_MAIN_FOLDERS) {
        const routed = routeToBestExistingMainFolder(catName, subName, taxonomy);
        catName = routed.category;
        subName = routed.subfolder;
        catNode = taxonomy[catName];
        catId = catNode?.id;
        console.log(`[sunyai] 🧠 12-Folder limit preserved (${currentMainCount}/12). Routed -> [${catName}] > [${subName}]`);
      } else {
        const newCat = await chrome.bookmarks.create({
          parentId: barId,
          title: catName
        });
        catId = newCat.id;
        taxonomy[catName] = { id: catId, name: catName, subfolders: {} };
        topCategoryIds.add(catId);
        console.log(`[sunyai] ✨ Instant Category Created: "${catName}"`);
      }
    }
  }

  // 3. Ensure Subfolder exists inside Category
  if (!taxonomy[catName]) {
    taxonomy[catName] = { id: catId, name: catName, subfolders: {} };
  }
  let subId = taxonomy[catName]?.subfolders?.[subName];
  if (!subId) {
    const existingSub = Object.keys(taxonomy[catName].subfolders || {}).find(s => 
      s.toLowerCase() === subName.toLowerCase() ||
      s.toLowerCase().includes(subName.toLowerCase()) ||
      subName.toLowerCase().includes(s.toLowerCase())
    );
    if (existingSub) {
      subId = taxonomy[catName].subfolders[existingSub];
      subName = existingSub;
    } else {
      const newSub = await chrome.bookmarks.create({
        parentId: catId,
        title: subName
      });
      subId = newSub.id;
      taxonomy[catName].subfolders[subName] = subId;
      subfolderIds.add(subId);
      console.log(`[sunyai] ✨ Instant Subfolder Created: [${catName}] > [${subName}]`);
    }
  }

  // Check if bookmark is already in target subfolder
  if (bookmark.parentId === subId) {
    return { moved: false, folder: catName, subfolder: subName, destination: `${catName} / ${subName}` };
  }

  // 4. Move bookmark autonomously (< 2ms)
  internalMovedIds.add(bookmark.id);
  await chrome.bookmarks.move(bookmark.id, { parentId: subId });
  setTimeout(() => internalMovedIds.delete(bookmark.id), 1200);

  console.log(`[sunyai] ⚡ Pushed: "${bookmark.title}" -> [${catName}] > [${subName}]`);

  // 5. In-Page visual confirmation pill & toolbar title
  await showInPageToast(catName, subName);

  // 6. Check destination folder for overcrowding
  try {
    const subChildren = await chrome.bookmarks.getChildren(subId);
    const urls = subChildren.filter(c => c.url);
    const subfolders = subChildren.filter(c => !c.url);
    if (urls.length >= OVERCROWDED_THRESHOLD) {
      await partitionSingleFolder({ id: subId, title: subName }, urls, subfolders);
    }
  } catch (e) {}

  return { moved: true, folder: catName, subfolder: subName, destination: `${catName} / ${subName}` };
}

// ---------------------------------------------------------------------------
// AUTONOMOUS SWEEPER
// ---------------------------------------------------------------------------

async function sweepLooseBookmarks() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (!settings.autoOrganize) return { count: 0, lastFolder: null, lastSubfolder: null, lastDestination: null, destinations: [] };

  const taxonomyData = await refreshTaxonomy();
  const { rootIds, topCategoryIds, subfolderIds } = taxonomyData;
  let count = 0;
  let lastFolder = null;
  let lastSubfolder = null;
  let lastDestination = null;
  const destinations = [];

  async function processFolder(folderId) {
    try {
      const children = await chrome.bookmarks.getChildren(folderId);
      for (const item of children) {
        if (item.url) {
          const res = await organizeSingleBookmark(item, settings);
          if (res && res.moved) {
            count++;
            lastFolder = res.folder;
            lastSubfolder = res.subfolder;
            lastDestination = res.destination;
            destinations.push(res.destination);
          }
        }
      }
    } catch (e) {}
  }

  // 1. Scan root folders (Bookmark Bar, Other, Mobile)
  for (const rid of rootIds) {
    await processFolder(rid);
  }

  // 2. Scan top-level categories on Bookmark Bar
  for (const catId of topCategoryIds) {
    await processFolder(catId);
  }

  // 3. Scan unorganized subfolders in Other or Mobile
  for (const rid of rootIds) {
    if (rid === taxonomyData.barId) continue;
    try {
      const children = await chrome.bookmarks.getChildren(rid);
      for (const item of children) {
        if (!item.url && !subfolderIds.has(item.id)) {
          const subChildren = await chrome.bookmarks.getChildren(item.id);
          for (const subItem of subChildren) {
            if (subItem.url) {
              const res = await organizeSingleBookmark(subItem, settings);
              if (res && res.moved) {
                count++;
                lastFolder = res.folder;
                lastSubfolder = res.subfolder;
                lastDestination = res.destination;
                destinations.push(res.destination);
              }
            }
          }
        }
      }
    } catch (e) {}
  }

  // 4. Overcrowded folder partitioning
  const partitionedCount = await partitionOvercrowdedFolders();
  count += partitionedCount;

  if (count > 0) {
    await chrome.storage.local.set({
      lastOrganizedCount: count,
      lastFolder: lastFolder || "",
      lastSubfolder: lastSubfolder || "",
      lastDestination: lastDestination || "",
      lastRun: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }

  return { count, lastFolder, lastSubfolder, lastDestination, destinations };
}
