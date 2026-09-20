/**
 * sunyai bookmark organizer (v3.0)
 *
 * WHAT'S NEW IN v3.0:
 * - Deep YouTube intelligence: Nepali vs English split inside Music, Vlogs, Comedy, etc.
 * - Nepali-language aware: detects Devanagari text, Nepali artists, Nepali news sites
 * - Social media expanded: Reddit, Twitter/X, Instagram, LinkedIn all routed smartly
 * - Shopping upgraded: Daraz, Sastodeal, Hamrobazar, Amazon sub-categories
 * - Education: Nepal universities, online courses, research papers
 * - Health & Fitness as a first-class category
 * - Food & Recipes: Nepali cuisine, international, restaurants
 * - Travel: Nepal destinations, international travel, booking sites
 * - Readable folder names for non-technical users
 * - 15-folder limit (raised from 12)
 * - Overcrowded threshold raised to 8 (avoids over-splitting small folders)
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

const MAX_MAIN_FOLDERS = 15;
const OVERCROWDED_THRESHOLD = 8;
const MAX_PARTITION_DEPTH = 3;

const internalMovedIds = new Set();
let cachedTaxonomy = null;
let lastTaxonomyRefresh = 0;

// ---------------------------------------------------------------------------
// IN-PAGE FLOATING TOAST
// ---------------------------------------------------------------------------

async function showInPageToast(catName, subName) {
  try {
    if (chrome.action) {
      try {
        chrome.action.setTitle({ title: `sunyai: Saved to ${catName} › ${subName}` });
        chrome.action.setBadgeText({ text: "✓" });
        chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
        setTimeout(() => { chrome.action.setBadgeText({ text: "" }); }, 3500);
      } catch (e) {}
    }

    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.id || !tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.startsWith("brave://") ||
        tab.url.startsWith("edge://")) return;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (cat, sub) => {
        const oldToast = document.getElementById("__sunyai_sync_toast__");
        if (oldToast) oldToast.remove();

        const toast = document.createElement("div");
        toast.id = "__sunyai_sync_toast__";
        toast.innerHTML = `
          <div style="display:flex;align-items:center;gap:9px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12.5px;line-height:1;">
            <div style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#f97316,#10b981);color:#fff;font-size:11px;font-weight:800;flex-shrink:0;">⚡</div>
            <div style="display:flex;flex-direction:column;gap:2px;">
              <span style="color:#a1a1aa;font-size:10px;font-weight:500;">Saved to</span>
              <span style="color:#f4f4f5;font-weight:700;">${cat} <span style="color:#f97316;">›</span> ${sub}</span>
            </div>
          </div>
        `;
        Object.assign(toast.style, {
          position: "fixed",
          top: "16px",
          right: "20px",
          zIndex: "2147483647",
          backgroundColor: "rgba(9,9,11,0.97)",
          color: "#f4f4f5",
          padding: "9px 16px",
          borderRadius: "12px",
          border: "1px solid rgba(249,115,22,0.35)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.7), 0 0 12px rgba(16,185,129,0.2)",
          pointerEvents: "none",
          transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          transform: "translateY(-18px) scale(0.92)",
          opacity: "0",
          backdropFilter: "blur(8px)"
        });
        document.documentElement.appendChild(toast);
        requestAnimationFrame(() => {
          toast.style.transform = "translateY(0) scale(1)";
          toast.style.opacity = "1";
        });
        setTimeout(() => {
          toast.style.transform = "translateY(-10px) scale(0.95)";
          toast.style.opacity = "0";
          setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        }, 2800);
      },
      args: [catName, subName]
    });
  } catch (err) {}
}

// ---------------------------------------------------------------------------
// LIFECYCLE & ALARMS
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(null);
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...existing, autoOrganize: true });
  if (chrome.alarms) {
    try { chrome.alarms.create("autonomous_sweep", { periodInMinutes: 1 }); } catch (e) {}
  }
  console.log("[sunyai v3.0] Engine initialized.");
  await refreshTaxonomy();
  await sweepLooseBookmarks();
});

chrome.runtime.onStartup.addListener(async () => {
  if (chrome.alarms) {
    try { chrome.alarms.create("autonomous_sweep", { periodInMinutes: 1 }); } catch (e) {}
  }
  await refreshTaxonomy();
  await sweepLooseBookmarks();
});

if (chrome.windows && chrome.windows.onCreated) {
  let initialStartupWindow = true;
  chrome.windows.onCreated.addListener(async () => {
    if (initialStartupWindow) {
      initialStartupWindow = false;
      await sweepLooseBookmarks();
      setTimeout(() => { initialStartupWindow = true; }, 8000);
    }
  });
}

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "autonomous_sweep") await sweepLooseBookmarks();
  });
}

setTimeout(() => {
  sweepLooseBookmarks().catch(err => console.error("[sunyai] boot sweep:", err));
}, 200);

// ---------------------------------------------------------------------------
// REAL-TIME EVENT LISTENERS
// ---------------------------------------------------------------------------

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (internalMovedIds.has(id)) return;
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (!settings.autoOrganize) return;
  await new Promise(r => setTimeout(r, 40));
  try {
    let targetNode = bookmark;
    if (!targetNode || !targetNode.url) {
      const nodes = await chrome.bookmarks.get(id);
      if (nodes && nodes[0]) targetNode = nodes[0];
    }
    if (targetNode && targetNode.url) await organizeSingleBookmark(targetNode, settings);
  } catch (err) { console.error("[sunyai] onCreated error:", err); }
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  if (internalMovedIds.has(id)) { internalMovedIds.delete(id); return; }
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (!settings.autoOrganize) return;
  await new Promise(r => setTimeout(r, 40));
  try {
    const nodes = await chrome.bookmarks.get(id);
    if (!nodes || !nodes[0] || !nodes[0].url) return;
    await organizeSingleBookmark(nodes[0], settings);
  } catch (err) { console.error("[sunyai] onMoved error:", err); }
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  if (internalMovedIds.has(id)) return;
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (!settings.autoOrganize) return;
  await new Promise(r => setTimeout(r, 50));
  try {
    const nodes = await chrome.bookmarks.get(id);
    if (!nodes || !nodes[0] || !nodes[0].url) return;
    await organizeSingleBookmark(nodes[0], settings);
  } catch (err) { console.error("[sunyai] onChanged error:", err); }
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
    }).catch((err) => sendResponse({ success: false, error: err.message }));
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
// TAXONOMY PARSER
// ---------------------------------------------------------------------------

async function refreshTaxonomy() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const roots = tree[0]?.children || [];
    const bar    = roots.find(r => r.id === "1" || (r.title && r.title.toLowerCase().includes("bar"))) || roots[0];
    const other  = roots.find(r => r.id === "2" || (r.title && r.title.toLowerCase().includes("other")));
    const synced = roots.find(r => r.id === "3" || (r.title && (r.title.toLowerCase().includes("mobile") || r.title.toLowerCase().includes("synced"))));

    const rootIds        = new Set([bar?.id, other?.id, synced?.id].filter(Boolean));
    const topCategoryIds = new Set();
    const subfolderIds   = new Set();
    const folderNodeMap  = new Map();
    const taxonomy = {};

    for (const item of bar?.children || []) {
      if (!item.url) {
        const topName = (item.title || "").trim();
        if (!topName) continue;
        topCategoryIds.add(item.id);
        folderNodeMap.set(item.id, item);
        taxonomy[topName] = { id: item.id, name: topName, subfolders: {} };
        for (const sub of item.children || []) {
          if (!sub.url) {
            const subName = (sub.title || "").trim();
            if (!subName) continue;
            subfolderIds.add(sub.id);
            folderNodeMap.set(sub.id, sub);
            taxonomy[topName].subfolders[subName] = sub.id;
            for (const deepSub of sub.children || []) {
              if (!deepSub.url) { subfolderIds.add(deepSub.id); folderNodeMap.set(deepSub.id, deepSub); }
            }
          }
        }
      }
    }

    cachedTaxonomy = {
      barId: bar ? bar.id : "1",
      rootIds, topCategoryIds, subfolderIds, folderNodeMap, taxonomy,
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
  if (!cachedTaxonomy || (Date.now() - lastTaxonomyRefresh > 15000)) await refreshTaxonomy();
  return cachedTaxonomy;
}

// ---------------------------------------------------------------------------
// WORD-BOUNDARY MATCHING  (<0.01ms)
// ---------------------------------------------------------------------------

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function wordMatch(text, keyword) {
  if (keyword.length <= 4 && !keyword.includes(" ")) {
    return new RegExp("(^|[^a-zA-Z0-9])" + escapeRegExp(keyword) + "($|[^a-zA-Z0-9])", "i").test(text);
  }
  return text.includes(keyword.toLowerCase());
}

function anyWord(text, keywords) { return keywords.some(k => wordMatch(text, k)); }

// Detect Devanagari (Nepali script)
function hasDevanagari(text) { return /[\u0900-\u097F]/.test(text); }

// ---------------------------------------------------------------------------
// GENRE CLASSIFICATION ENGINE  (v3.0)
// ---------------------------------------------------------------------------

function classifyContentGenre(title, url, taxonomy) {
  const text = ((title || "") + " " + (url || "")).toLowerCase();
  let domain = "";
  try { const u = new URL(url); domain = u.hostname.replace(/^www\./, "").toLowerCase(); } catch (e) {}

  const rawTitle = (title || "");
  const isNepaliContent = hasDevanagari(rawTitle) || anyWord(text, [
    "nepali", "nepalese", "nepal", "kathmandu", "pokhara", "namaskar",
    "nepse", "setopati", "onlinekhabar", "ekantipur", "hamropatro",
    "gorkhapatra", "ratopati", "annapurnapost", "dashain", "tihar", "teej"
  ]);

  const findExistingCat = (keywords) =>
    Object.keys(taxonomy).find(cat => keywords.some(k => cat.toLowerCase().includes(k)));


  // ==========================================================================
  // 1.  YOUTUBE — richest block with Nepali/English split
  // ==========================================================================
  const isYouTube = domain.includes("youtube.com") || domain.includes("youtu.be");

  if (isYouTube) {
    const cat = findExistingCat(["youtube", "video"]) || "YouTube";

    // 1a. MUSIC
    const isMusicSignal = anyWord(text, [
      "music video", "official video", "official audio", "official music",
      "lyric video", "lyrics", "song", "album", "lofi", "remix", "acoustic",
      "live performance", "concert", "vevo", "soundtrack", "ost",
      // Nepali artists
      "sujan chapagain", "nawaraj parajuli", "john rai", "bartika rai",
      "swoopna suman", "yama buddha", "neetesh jung kunwar", "melina rai",
      "nhyoo bajracharya", "1974 ad", "albatross", "cobweb band", "the uglyz",
      "bipul chettri", "m.s.bista", "sushant kc", "paul shah", "prakash saput",
      "rekha thapa", "durgesh thapa", "pradeep khadka", "samir shrestha",
      // English/global
      "pop music", "hip hop", "rap", "rock", "jazz", "edm", "indie music",
      "cover song", "taylor swift", "the weeknd", "billie eilish", "drake",
      "ed sheeran", "coldplay", "eminem", "imagine dragons",
      // Bollywood
      "bollywood", "hindi song", "ghazal", "qawwali", "bhajan",
      "arijit singh", "shreya ghoshal", "atif aslam"
    ]);

    if (isMusicSignal) {
      const isNepaliMusic = isNepaliContent || anyWord(text, [
        "nepali song", "nepali music", "sujan chapagain", "nawaraj parajuli",
        "bartika rai", "swoopna", "yama buddha", "bipul chettri", "1974 ad",
        "paul shah", "prakash saput", "rekha thapa", "albatross", "cobweb",
        "the uglyz", "m.s.bista", "sushant kc", "lok dohori", "deuda",
        "roila", "jhyure"
      ]);
      const isBollywood = anyWord(text, [
        "bollywood", "hindi song", "hindi music", "ghazal", "qawwali",
        "bhajan", "arijit singh", "shreya ghoshal", "atif aslam",
        "kumar sanu", "lata mangeshkar", "a.r. rahman"
      ]);
      if (isNepaliMusic) return { category: cat, subfolder: "🎵 Nepali Music" };
      if (isBollywood)   return { category: cat, subfolder: "🎵 Bollywood & Hindi" };
      return           { category: cat, subfolder: "🎵 English Music" };
    }

    // 1b. VLOGS
    if (anyWord(text, [
      "vlog", "day in my life", "with me", "my routine", "travel vlog",
      "life in", "moving to", "living in", "daily life", "morning routine",
      "come with me", "week in my life"
    ])) {
      if (isNepaliContent) return { category: cat, subfolder: "📹 Nepali Vlogs" };
      return { category: cat, subfolder: "📹 English Vlogs" };
    }

    // 1c. COMEDY
    if (anyWord(text, [
      "comedy", "funny", "prank", "skit", "roast", "stand up", "stand-up",
      "meme", "parody", "satire",
      "magne budo", "ramsay brothers", "misty gravel", "garo pani",
      "shivahari", "madan krishna", "chunna manna", "sarkari biruwa"
    ])) {
      if (isNepaliContent) return { category: cat, subfolder: "😂 Nepali Comedy" };
      return { category: cat, subfolder: "😂 Comedy & Entertainment" };
    }

    // 1d. DOCUMENTARY
    if (anyWord(text, [
      "documentary", "investigative", "herne katha", "the nepali comment",
      "docuseries", "history of", "untold story", "biography",
      "dw documentary", "vox", "frontline", "bbc documentary", "national geographic"
    ])) {
      return { category: cat, subfolder: "🎬 Documentary" };
    }

    // 1e. SHORT FILM / CINEMA
    if (anyWord(text, [
      "short movie", "short film", "short cinema", "micro movie",
      "cinema", "film", "trailer", "teaser", "feature film",
      "indie film", "full movie", "web series"
    ])) {
      return { category: cat, subfolder: "🎬 Short Films & Cinema" };
    }

    // 1f. NEPSE / SHARE MARKET
    if (anyWord(text, [
      "nepse", "sebon", "share market", "share bazar", "share bazaar",
      "stock market", "ipo", "meroshare", "ideapreneur", "dividend",
      "mutual fund", "fundamental analysis", "technical analysis",
      "candlestick", "trading course", "portfolio"
    ])) {
      return { category: cat, subfolder: "📈 NEPSE & Share Market" };
    }

    // 1g. COURSES & TUTORIALS
    if (anyWord(text, [
      "course", "full course", "tutorial", "crash course", "learn in",
      "beginner to pro", "masterclass", "complete guide", "roadmap",
      "zero to hero", "bootcamp", "step by step", "how to code",
      "learn python", "learn javascript", "freecodecamp", "programming tutorial"
    ])) {
      return { category: cat, subfolder: "🎓 Courses & Tutorials" };
    }

    // 1h. TECH REVIEWS
    if (anyWord(text, [
      "review", "unboxing", "hands on", "iphone", "macbook", "gpu",
      "laptop", "mkbhd", "dave2d", "hardware", "chips", "benchmark",
      "ai model", "gpt review", "claude review", "gemini review"
    ])) {
      return { category: cat, subfolder: "📱 Tech Reviews & Gadgets" };
    }

    // 1i. RESEARCH & SCIENCE
    if (anyWord(text, [
      "research", "deep dive", "explained", "how it works", "the science of",
      "physics", "quantum", "neuroscience", "veritasium", "kurzgesagt",
      "cleo abram", "mark rober", "3blue1brown", "computerphile",
      "numberphile", "scishow", "ted talk", "ted-ed"
    ])) {
      return { category: cat, subfolder: "🔬 Research & Science" };
    }

    // 1j. PODCASTS & INTERVIEWS
    if (anyWord(text, [
      "podcast", "interview", "conversation with", "joe rogan", "lex fridman",
      "huberman", "hormozi", "tim ferriss", "diary of a ceo"
    ])) {
      return { category: cat, subfolder: "🎙️ Podcasts & Interviews" };
    }

    // 1k. MOTIVATION & SELF-HELP
    if (anyWord(text, [
      "motivation", "self help", "mindset", "productivity", "success story",
      "discipline", "habit", "goal setting", "james clear", "simon sinek"
    ])) {
      return { category: cat, subfolder: "💡 Motivation & Self-Help" };
    }

    // 1l. COOKING / FOOD
    if (anyWord(text, [
      "recipe", "cooking", "how to make", "food", "baking",
      "nepali food", "dal bhat", "momo", "thukpa", "sel roti",
      "curry", "kitchen", "chef", "khana pakau"
    ])) {
      return { category: cat, subfolder: "🍜 Cooking & Food" };
    }

    // 1m. GAMING
    if (anyWord(text, [
      "gaming", "gameplay", "game review", "lets play", "let's play",
      "minecraft", "gta", "valorant", "pubg", "fortnite", "chess", "esports"
    ])) {
      return { category: cat, subfolder: "🎮 Gaming" };
    }

    // 1n. NEWS
    if (anyWord(text, [
      "news", "current affairs", "breaking", "politics", "election",
      "government", "budget", "parliament"
    ])) {
      if (isNepaliContent) return { category: cat, subfolder: "📰 Nepal News" };
      return { category: cat, subfolder: "📰 World News" };
    }

    return { category: cat, subfolder: "▶️ General Videos" };
  }


  // ==========================================================================
  // 2.  SOCIAL MEDIA
  // ==========================================================================
  if (domain.includes("reddit.com")) {
    const cat = findExistingCat(["social", "community", "forum"]) || "Social Media";
    if (anyWord(text, ["nepali", "nepal", "r/nepal", "r/nepalimemes"])) return { category: cat, subfolder: "Reddit – Nepal" };
    if (anyWord(text, ["r/programming", "r/learnprogramming", "r/webdev", "r/technology", "r/python"])) return { category: cat, subfolder: "Reddit – Tech" };
    if (anyWord(text, ["r/finance", "r/investing", "r/stocks", "r/wallstreetbets", "r/crypto"])) return { category: cat, subfolder: "Reddit – Finance" };
    return { category: cat, subfolder: "Reddit – General" };
  }

  if (domain.includes("twitter.com") || domain.includes("x.com")) {
    const cat = findExistingCat(["social", "twitter", "x.com"]) || "Social Media";
    return { category: cat, subfolder: "Twitter / X" };
  }

  if (domain.includes("instagram.com")) {
    const cat = findExistingCat(["social", "instagram"]) || "Social Media";
    return { category: cat, subfolder: "Instagram" };
  }

  if (domain.includes("facebook.com") || domain.includes("fb.com")) {
    const cat = findExistingCat(["social", "facebook"]) || "Social Media";
    return { category: cat, subfolder: "Facebook" };
  }

  if (domain.includes("linkedin.com")) {
    const cat = findExistingCat(["social", "linkedin", "career", "job"]) || "Career & Jobs";
    if (anyWord(text, ["job", "vacancy", "hiring", "apply"])) return { category: cat, subfolder: "LinkedIn Jobs" };
    return { category: cat, subfolder: "LinkedIn – Articles & People" };
  }

  if (domain.includes("tiktok.com")) {
    const cat = findExistingCat(["social", "tiktok"]) || "Social Media";
    return { category: cat, subfolder: "TikTok" };
  }


  // ==========================================================================
  // 3.  NEWS & JOURNALISM
  // ==========================================================================
  const nepaliNewsSites = [
    "setopati.com", "onlinekhabar.com", "ekantipur.com", "ratopati.com",
    "annapurnapost.com", "gorkhapatra.org.np", "hamropatro.com",
    "nagariknews.com", "nepalnews.com", "nepalitimes.com", "myrepublica.com"
  ];
  const globalNewsSites = [
    "reuters.com", "apnews.com", "nytimes.com", "bbc.com", "bbc.co.uk",
    "theguardian.com", "aljazeera.com", "cnn.com"
  ];
  const bizMagazines  = ["forbes.com", "fortune.com", "bloomberg.com", "wsj.com", "economist.com", "hbr.org", "businessinsider.com"];
  const techMagazines = ["techcrunch.com", "wired.com", "theverge.com", "arstechnica.com", "technologyreview.com", "venturebeat.com"];

  if (anyWord(domain, nepaliNewsSites) || anyWord(text, ["setopati", "onlinekhabar", "ekantipur", "ratopati"])) {
    const cat = findExistingCat(["news", "nepal news"]) || "Nepal News";
    return { category: cat, subfolder: "Nepali News Sites" };
  }
  if (anyWord(domain, globalNewsSites)) {
    const cat = findExistingCat(["news", "world news"]) || "World News";
    return { category: cat, subfolder: "Global News" };
  }
  if (anyWord(domain, bizMagazines) || anyWord(text, ["forbes", "bloomberg news", "wall street journal", "harvard business review"])) {
    const cat = findExistingCat(["magazine", "news"]) || "World News";
    return { category: cat, subfolder: "Business Magazines" };
  }
  if (anyWord(domain, techMagazines) || anyWord(text, ["techcrunch", "wired magazine", "the verge"])) {
    const cat = findExistingCat(["magazine", "tech", "news"]) || "World News";
    return { category: cat, subfolder: "Tech News & Magazines" };
  }


  // ==========================================================================
  // 4.  AI & MACHINE LEARNING
  // ==========================================================================
  if (anyWord(text, [
    "chatgpt", "openai", "claude", "anthropic", "deepseek", "gemini",
    "huggingface", "ollama", "mistral", "llama", "gemma", "midjourney",
    "stable diffusion", "comfyui", "prompt engineering", "runway",
    "elevenlabs", "suno", "perplexity", "groq", "neural network", "genai"
  ])) {
    const cat = findExistingCat(["neural", "ai", "machine learning", "artificial"]) || "🤖 AI & Machine Learning";
    if (anyWord(text, ["voice ai", "tts", "stt", "elevenlabs", "suno", "audio ai"])) return { category: cat, subfolder: "Voice & Audio AI" };
    if (anyWord(text, ["image", "midjourney", "stable diffusion", "comfyui", "runway", "video generation"])) return { category: cat, subfolder: "Image & Video AI" };
    return { category: cat, subfolder: "LLMs & Chat AI" };
  }


  // ==========================================================================
  // 5.  DEVELOPER TOOLS & CODE
  // ==========================================================================
  if (anyWord(text, [
    "agent", "mcp server", "openrouter", "cursor", "github copilot",
    "vibe coding", "github.com", "gitlab", "langchain",
    "docker", "kubernetes", "linux", "devops", "cloud", "aws", "azure", "gcp",
    "grafana", "prometheus", "programming", "open source",
    "npm", "python", "javascript", "typescript", "rust", "golang", "flutter"
  ])) {
    const cat = findExistingCat(["developer", "dev tools", "agentic", "noc", "code"]) || "💻 Developer Tools";
    if (anyWord(text, ["mcp server", "agent", "swarm", "langchain", "llamaindex"])) return { category: cat, subfolder: "AI Agents & MCP" };
    if (anyWord(text, ["grafana", "prometheus", "kubernetes", "docker", "devops", "sre", "cloud"])) return { category: cat, subfolder: "DevOps & Cloud" };
    if (anyWord(text, ["github.com", "gitlab", "open source", "repository"])) return { category: cat, subfolder: "GitHub & Open Source" };
    return { category: cat, subfolder: "Programming & Code" };
  }


  // ==========================================================================
  // 6.  FINANCE & INVESTING
  // ==========================================================================

  // 6a. NEPSE
  if (anyWord(text, [
    "nepse", "sebon", "share market", "share bazar", "stock market",
    "ipo", "meroshare", "ideapreneur", "dividend", "mutual fund"
  ])) {
    const cat = findExistingCat(["finance", "nepse", "investing"]) || "📈 Finance & Investing";
    return { category: cat, subfolder: "NEPSE & Nepal Stock Market" };
  }

  // 6b. Prop Trading / Forex / Crypto
  if (anyWord(text, [
    "prop trading", "funded", "forex", "babypips", "ftmo", "apex", "tradingview",
    "dex", "solana", "ethereum", "bitcoin", "crypto", "binance", "bybit",
    "hyperliquid", "payout", "raw spread"
  ])) {
    const cat = findExistingCat(["prop trading", "trading", "crypto", "finance"]) || "📈 Finance & Investing";
    if (anyWord(text, ["crypto", "dex", "hyperliquid", "solana", "ethereum", "bitcoin"])) return { category: cat, subfolder: "Crypto Trading" };
    return { category: cat, subfolder: "Forex & Prop Trading" };
  }

  // 6c. Banking / General Finance
  if (anyWord(text, [
    "banking", "nrb", "monetary policy", "stripe", "payment gateway",
    "remittance", "inflation", "budget news", "fintech"
  ])) {
    const cat = findExistingCat(["finance", "banking"]) || "📈 Finance & Investing";
    return { category: cat, subfolder: "Banking & Fintech" };
  }


  // ==========================================================================
  // 7.  EDUCATION & LEARNING
  // ==========================================================================
  if (anyWord(text, [
    "udemy", "coursera", "edx", "skillshare", "khan academy",
    "certification", "bootcamp", "learn", "moodle",
    "tribhuvan university", "kathmandu university", "pokhara university",
    "scholarship", "syllabus", "textbook", "arxiv", "research paper",
    "sciencedirect", "pubmed"
  ])) {
    const cat = findExistingCat(["education", "learn", "course", "assignment", "university"]) || "🎓 Education";
    if (anyWord(text, ["moodle", "tribhuvan", "kathmandu university", "pokhara university", "exam portal"])) return { category: cat, subfolder: "Nepal University & Exams" };
    if (anyWord(text, ["udemy", "coursera", "edx", "skillshare", "certification"])) return { category: cat, subfolder: "Online Courses" };
    if (anyWord(text, ["arxiv", "research paper", "scholar", "sciencedirect", "pubmed"])) return { category: cat, subfolder: "Research Papers & Journals" };
    return { category: cat, subfolder: "Learning Resources" };
  }


  // ==========================================================================
  // 8.  CAREER & JOBS
  // ==========================================================================
  if (anyWord(text, [
    "job vacancy", "career", "intern", "merojob", "jobsnepal",
    "jobejee", "linkedin.com/jobs", "recruitment", "resume tips",
    "cover letter", "interview tips"
  ])) {
    const cat = findExistingCat(["career", "job", "pipeline"]) || "💼 Career & Jobs";
    if (anyWord(text, ["merojob", "jobsnepal", "jobejee"])) return { category: cat, subfolder: "Nepal Jobs" };
    return { category: cat, subfolder: "Jobs & Career Advice" };
  }


  // ==========================================================================
  // 9.  SHOPPING
  // ==========================================================================
  const nepaliShops  = ["daraz.com.np", "sastodeal.com", "hamrobazar.com", "olx.com.np", "gyapu.com"];
  const globalShops  = ["amazon.com", "amazon.co.uk", "ebay.com", "aliexpress.com", "flipkart.com", "etsy.com"];

  if (anyWord(domain, nepaliShops)) {
    const cat = findExistingCat(["shopping", "e-commerce"]) || "🛒 Shopping";
    return { category: cat, subfolder: "Nepal Online Shopping" };
  }
  if (anyWord(domain, globalShops)) {
    const cat = findExistingCat(["shopping", "e-commerce"]) || "🛒 Shopping";
    return { category: cat, subfolder: "International Shopping" };
  }


  // ==========================================================================
  // 10.  FOOD & RECIPES
  // ==========================================================================
  if (anyWord(text, [
    "recipe", "cooking", "food blog", "restaurant", "baking", "cuisine",
    "meal prep", "dal bhat", "momo", "thukpa", "sel roti", "chatamari",
    "dhido", "gundruk", "kwati", "yomari", "aloo tama", "nepali khana"
  ])) {
    const cat = findExistingCat(["food", "recipe", "cooking"]) || "🍜 Food & Recipes";
    if (isNepaliContent || anyWord(text, ["dal bhat", "momo", "thukpa", "sel roti", "dhido", "nepali khana"])) return { category: cat, subfolder: "Nepali Recipes" };
    return { category: cat, subfolder: "Recipes & Cooking" };
  }


  // ==========================================================================
  // 11.  HEALTH & FITNESS
  // ==========================================================================
  if (anyWord(text, [
    "health", "fitness", "workout", "gym", "yoga", "meditation",
    "nutrition", "diet", "weight loss", "running", "exercise",
    "mental health", "therapy", "doctor", "hospital", "medicine"
  ])) {
    const cat = findExistingCat(["health", "fitness", "wellness"]) || "💪 Health & Fitness";
    if (anyWord(text, ["mental health", "therapy", "anxiety", "depression", "mindfulness", "meditation"])) return { category: cat, subfolder: "Mental Health & Wellness" };
    if (anyWord(text, ["workout", "gym", "exercise", "yoga", "running", "weight loss"])) return { category: cat, subfolder: "Fitness & Exercise" };
    return { category: cat, subfolder: "Health & Medical" };
  }


  // ==========================================================================
  // 12.  TRAVEL & PLACES
  // ==========================================================================
  if (anyWord(text, [
    "travel", "trip", "tour", "tourism", "destination", "hotel", "airbnb",
    "booking", "visa", "passport", "hike", "trek", "mountain",
    "kathmandu", "pokhara", "chitwan", "lumbini", "mustang",
    "everest", "annapurna", "himalayas"
  ])) {
    const cat = findExistingCat(["travel", "tourism"]) || "✈️ Travel & Places";
    if (anyWord(text, ["kathmandu", "pokhara", "chitwan", "mustang", "everest", "annapurna", "nepal trek"])) return { category: cat, subfolder: "Nepal Travel & Trekking" };
    if (anyWord(text, ["booking", "hotels.com", "airbnb", "expedia", "skyscanner", "agoda"])) return { category: cat, subfolder: "Booking & Travel Sites" };
    return { category: cat, subfolder: "International Travel" };
  }


  // ==========================================================================
  // 13.  DESIGN & CREATIVE
  // ==========================================================================
  if (anyWord(domain, ["figma.com", "dribbble.com", "behance.net", "freepik.com", "unsplash.com", "canva.com", "adobe.com", "coolors.co"]) ||
      anyWord(text, ["ui design", "ux design", "figma", "prototype", "wireframe", "graphic design"])) {
    const cat = findExistingCat(["design", "creative", "ui"]) || "🎨 Design & Creative";
    if (anyWord(text, ["figma", "prototype", "wireframe", "ui design", "ux design"])) return { category: cat, subfolder: "UI/UX Design" };
    return { category: cat, subfolder: "Graphics & Assets" };
  }


  // ==========================================================================
  // 14.  ENTERTAINMENT
  // ==========================================================================
  if (anyWord(text, [
    "netflix", "prime video", "hulu", "disney plus", "stream movies",
    "moviesjoy", "myflixer", "hdmovie", "sflix",
    "nepali film", "kollywood", "jhalak"
  ])) {
    const cat = findExistingCat(["entertainment", "streaming", "movies"]) || "🎬 Entertainment";
    if (anyWord(text, ["nepali film", "kollywood", "nepali cinema"])) return { category: cat, subfolder: "Nepali Films" };
    return { category: cat, subfolder: "Streaming & Movies" };
  }


  // ==========================================================================
  // 15.  SMART DOMAIN FALLBACK
  // ==========================================================================
  if (domain) {
    const ignored = new Set(["com", "net", "org", "co", "io", "app", "gov", "edu", "np", "uk", "in", "ai", "to", "xyz", "tv", "top"]);
    const parts = domain.split(".");
    let brand = "";
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!ignored.has(p) && p.length > 2) { brand = p; break; }
    }
    if (brand) {
      const brandCap = brand.charAt(0).toUpperCase() + brand.slice(1);
      const cat = findExistingCat(["tools", "utilities"]) || "🛠️ Web Tools";
      return { category: cat, subfolder: `${brandCap} Services` };
    }
  }

  return { category: "🛠️ Web Tools", subfolder: "General Bookmarks" };
}

// ---------------------------------------------------------------------------
// HIGH INTELLIGENCE ROUTER  (enforces <= MAX_MAIN_FOLDERS)
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

    if ((targetText.includes("nepse") || targetText.includes("stock") || targetText.includes("investing")) && (catLower.includes("finance") || catLower.includes("investing"))) score += 50;
    if ((targetText.includes("youtube") || targetText.includes("video")) && (catLower.includes("youtube") || catLower.includes("video"))) score += 45;
    if ((targetText.includes("news") || targetText.includes("journalism")) && catLower.includes("news")) score += 45;
    if ((targetText.includes("ai") || targetText.includes("neural") || targetText.includes("llm")) && (catLower.includes("ai") || catLower.includes("neural") || catLower.includes("machine"))) score += 45;
    if ((targetText.includes("code") || targetText.includes("developer") || targetText.includes("github")) && (catLower.includes("developer") || catLower.includes("code"))) score += 45;
    if ((targetText.includes("education") || targetText.includes("course") || targetText.includes("university")) && (catLower.includes("education") || catLower.includes("learn"))) score += 45;
    if ((targetText.includes("health") || targetText.includes("fitness")) && (catLower.includes("health") || catLower.includes("fitness"))) score += 45;
    if ((targetText.includes("travel") || targetText.includes("tourism")) && catLower.includes("travel")) score += 45;
    if ((targetText.includes("food") || targetText.includes("recipe")) && (catLower.includes("food") || catLower.includes("recipe"))) score += 45;
    if ((targetText.includes("social") || targetText.includes("reddit") || targetText.includes("twitter")) && catLower.includes("social")) score += 40;

    if (score > highestScore) { highestScore = score; bestCat = cat; }
  }

  return { category: bestCat || existingCats[0], subfolder: targetSub };
}

// ---------------------------------------------------------------------------
// OVERCROWDED PARTITIONER
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
    if (ids.length >= 2) result.push({ subfolder: subName, bookmarkIds: ids });
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
        const createdSub = await chrome.bookmarks.create({ parentId: folderNode.id, title: subName });
        targetSubId = createdSub.id;
        existingSubMap.set(subName.toLowerCase(), targetSubId);
      } catch (err) { continue; }
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
    if (clusterMoved > 0) await showInPageToast(folderName, `${subName} (${clusterMoved} items)`);
  }

  return movedCount;
}

async function partitionOvercrowdedFolders() {
  const tree = await chrome.bookmarks.getTree();
  let totalPartitioned = 0;

  async function inspectNode(folderNode, depth = 0) {
    if (!folderNode || depth > 1) return;
    let children = [];
    try { children = await chrome.bookmarks.getChildren(folderNode.id); } catch (e) { return; }
    const urlItems       = children.filter(c => c.url);
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
      if (!child.url) await inspectNode(child, 1);
    }
  }
  return totalPartitioned;
}

// ---------------------------------------------------------------------------
// CORE ORGANIZER
// ---------------------------------------------------------------------------

async function organizeSingleBookmark(bookmark, settings) {
  if (!bookmark || !bookmark.url) return false;

  const taxonomyData = await getTaxonomy();
  const { barId, rootIds, topCategoryIds, subfolderIds, taxonomy } = taxonomyData;

  const match = classifyContentGenre(bookmark.title, bookmark.url, taxonomy);
  let catName = match.category;
  let subName = match.subfolder;

  let catNode = taxonomy[catName];
  let catId = catNode?.id;
  if (!catId) {
    const existingCat = Object.keys(taxonomy).find(k => k.toLowerCase() === catName.toLowerCase());
    if (existingCat) {
      catId = taxonomy[existingCat].id; catName = existingCat; catNode = taxonomy[catName];
    } else {
      const currentMainCount = Object.keys(taxonomy).length;
      if (currentMainCount >= MAX_MAIN_FOLDERS) {
        const routed = routeToBestExistingMainFolder(catName, subName, taxonomy);
        catName = routed.category; subName = routed.subfolder;
        catNode = taxonomy[catName]; catId = catNode?.id;
      } else {
        const newCat = await chrome.bookmarks.create({ parentId: barId, title: catName });
        catId = newCat.id;
        taxonomy[catName] = { id: catId, name: catName, subfolders: {} };
        topCategoryIds.add(catId);
      }
    }
  }

  if (!taxonomy[catName]) taxonomy[catName] = { id: catId, name: catName, subfolders: {} };
  let subId = taxonomy[catName]?.subfolders?.[subName];
  if (!subId) {
    const existingSub = Object.keys(taxonomy[catName].subfolders || {}).find(s =>
      s.toLowerCase() === subName.toLowerCase() ||
      s.toLowerCase().includes(subName.toLowerCase()) ||
      subName.toLowerCase().includes(s.toLowerCase())
    );
    if (existingSub) {
      subId = taxonomy[catName].subfolders[existingSub]; subName = existingSub;
    } else {
      const newSub = await chrome.bookmarks.create({ parentId: catId, title: subName });
      subId = newSub.id;
      taxonomy[catName].subfolders[subName] = subId;
      subfolderIds.add(subId);
    }
  }

  if (bookmark.parentId === subId) {
    return { moved: false, folder: catName, subfolder: subName, destination: `${catName} / ${subName}` };
  }

  internalMovedIds.add(bookmark.id);
  await chrome.bookmarks.move(bookmark.id, { parentId: subId });
  setTimeout(() => internalMovedIds.delete(bookmark.id), 1200);

  console.log(`[sunyai] ⚡ "${bookmark.title}" → [${catName}] › [${subName}]`);
  await showInPageToast(catName, subName);

  try {
    const subChildren = await chrome.bookmarks.getChildren(subId);
    const urls = subChildren.filter(c => c.url);
    const subs = subChildren.filter(c => !c.url);
    if (urls.length >= OVERCROWDED_THRESHOLD) await partitionSingleFolder({ id: subId, title: subName }, urls, subs);
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
  let count = 0, lastFolder = null, lastSubfolder = null, lastDestination = null;
  const destinations = [];

  async function processFolder(folderId) {
    try {
      const children = await chrome.bookmarks.getChildren(folderId);
      for (const item of children) {
        if (item.url) {
          const res = await organizeSingleBookmark(item, settings);
          if (res && res.moved) { count++; lastFolder = res.folder; lastSubfolder = res.subfolder; lastDestination = res.destination; destinations.push(res.destination); }
        }
      }
    } catch (e) {}
  }

  for (const rid of rootIds) await processFolder(rid);
  for (const catId of topCategoryIds) await processFolder(catId);

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
              if (res && res.moved) { count++; lastFolder = res.folder; lastSubfolder = res.subfolder; lastDestination = res.destination; destinations.push(res.destination); }
            }
          }
        }
      }
    } catch (e) {}
  }

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
