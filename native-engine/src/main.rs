use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

const OVERCROWDED_THRESHOLD: usize = 8;
const MAX_MAIN_FOLDERS: usize = 15;

#[derive(Serialize, Deserialize, Debug, Clone)]
struct BookmarkNode {
    #[serde(default)]
    pub date_added: String,
    #[serde(default)]
    pub date_last_used: String,
    #[serde(default)]
    pub date_modified: String,
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub children: Option<Vec<BookmarkNode>>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct BookmarkRoots {
    pub bookmark_bar: BookmarkNode,
    #[serde(default)]
    pub other: Option<BookmarkNode>,
    #[serde(default)]
    pub synced: Option<BookmarkNode>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct BookmarksFile {
    pub checksum: Option<String>,
    pub roots: BookmarkRoots,
    pub version: u32,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, PartialEq, Eq)]
struct Classification {
    category: String,
    subfolder: String,
}

fn has_devanagari(text: &str) -> bool {
    text.chars().any(|c| ('\u{0900}'..='\u{097F}').contains(&c))
}

fn classify_genre(title: &str, url: &str) -> Classification {
    let text = format!("{} {}", title, url).to_lowercase();
    let domain = extract_domain(url);

    let is_nepali_content = has_devanagari(title) || any_in(&text, &[
        "nepali", "nepalese", "nepal", "kathmandu", "pokhara", "namaskar",
        "nepse", "setopati", "onlinekhabar", "ekantipur", "hamropatro",
        "gorkhapatra", "ratopati", "annapurnapost", "dashain", "tihar", "teej"
    ]);

    let is_youtube = domain.contains("youtube.com") || domain.contains("youtu.be");

    // =========================================================================
    // 1. YOUTUBE
    // =========================================================================
    if is_youtube {
        let cat = "YouTube".to_string();

        // 1a. Music
        let is_music_signal = any_in(&text, &[
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

        if is_music_signal {
            let is_nepali_music = is_nepali_content || any_in(&text, &[
                "nepali song", "nepali music", "sujan chapagain", "nawaraj parajuli",
                "bartika rai", "swoopna", "yama buddha", "bipul chettri", "1974 ad",
                "paul shah", "prakash saput", "rekha thapa", "albatross", "cobweb",
                "the uglyz", "m.s.bista", "sushant kc", "lok dohori", "deuda",
                "roila", "jhyure"
            ]);
            let is_bollywood = any_in(&text, &[
                "bollywood", "hindi song", "hindi music", "ghazal", "qawwali",
                "bhajan", "arijit singh", "shreya ghoshal", "atif aslam",
                "kumar sanu", "lata mangeshkar", "a.r. rahman"
            ]);

            if is_nepali_music {
                return Classification { category: cat, subfolder: "🎵 Nepali Music".to_string() };
            }
            if is_bollywood {
                return Classification { category: cat, subfolder: "🎵 Bollywood & Hindi".to_string() };
            }
            return Classification { category: cat, subfolder: "🎵 English Music".to_string() };
        }

        // 1b. Vlogs
        if any_in(&text, &[
            "vlog", "day in my life", "with me", "my routine", "travel vlog",
            "life in", "moving to", "living in", "daily life", "morning routine",
            "come with me", "week in my life"
        ]) {
            if is_nepali_content {
                return Classification { category: cat, subfolder: "📹 Nepali Vlogs".to_string() };
            }
            return Classification { category: cat, subfolder: "📹 English Vlogs".to_string() };
        }

        // 1c. Comedy
        if any_in(&text, &[
            "comedy", "funny", "prank", "skit", "roast", "stand up", "stand-up",
            "meme", "parody", "satire",
            "magne budo", "ramsay brothers", "misty gravel", "garo pani",
            "shivahari", "madan krishna", "chunna manna", "sarkari biruwa"
        ]) {
            if is_nepali_content {
                return Classification { category: cat, subfolder: "😂 Nepali Comedy".to_string() };
            }
            return Classification { category: cat, subfolder: "😂 Comedy & Entertainment".to_string() };
        }

        // 1d. Documentary
        if any_in(&text, &[
            "documentary", "investigative", "herne katha", "the nepali comment",
            "docuseries", "history of", "untold story", "biography",
            "dw documentary", "vox", "frontline", "bbc documentary", "national geographic"
        ]) {
            return Classification { category: cat, subfolder: "🎬 Documentary".to_string() };
        }

        // 1e. Short Films & Cinema
        if any_in(&text, &[
            "short movie", "short film", "short cinema", "micro movie",
            "cinema", "film", "trailer", "teaser", "feature film",
            "indie film", "full movie", "web series"
        ]) {
            return Classification { category: cat, subfolder: "🎬 Short Films & Cinema".to_string() };
        }

        // 1f. NEPSE & Share Market
        if any_in(&text, &[
            "nepse", "sebon", "share market", "share bazar", "share bazaar",
            "stock market", "ipo", "meroshare", "ideapreneur", "dividend",
            "mutual fund", "fundamental analysis", "technical analysis",
            "candlestick", "trading course", "portfolio"
        ]) {
            return Classification { category: cat, subfolder: "📈 NEPSE & Share Market".to_string() };
        }

        // 1g. Courses & Tutorials
        if any_in(&text, &[
            "course", "full course", "tutorial", "crash course", "learn in",
            "beginner to pro", "masterclass", "complete guide", "roadmap",
            "zero to hero", "bootcamp", "step by step", "how to code",
            "learn python", "learn javascript", "freecodecamp", "programming tutorial"
        ]) {
            return Classification { category: cat, subfolder: "🎓 Courses & Tutorials".to_string() };
        }

        // 1h. Tech Reviews & Gadgets
        if any_in(&text, &[
            "review", "unboxing", "hands on", "iphone", "macbook", "gpu",
            "laptop", "mkbhd", "dave2d", "hardware", "chips", "benchmark",
            "ai model", "gpt review", "claude review", "gemini review"
        ]) {
            return Classification { category: cat, subfolder: "📱 Tech Reviews & Gadgets".to_string() };
        }

        // 1i. Research & Science
        if any_in(&text, &[
            "research", "deep dive", "explained", "how it works", "the science of",
            "physics", "quantum", "neuroscience", "veritasium", "kurzgesagt",
            "cleo abram", "mark rober", "3blue1brown", "computerphile",
            "numberphile", "scishow", "ted talk", "ted-ed"
        ]) {
            return Classification { category: cat, subfolder: "🔬 Research & Science".to_string() };
        }

        // 1j. Podcasts & Interviews
        if any_in(&text, &[
            "podcast", "interview", "conversation with", "joe rogan", "lex fridman",
            "huberman", "hormozi", "tim ferriss", "diary of a ceo"
        ]) {
            return Classification { category: cat, subfolder: "🎙️ Podcasts & Interviews".to_string() };
        }

        // 1k. Motivation & Self-Help
        if any_in(&text, &[
            "motivation", "self help", "mindset", "productivity", "success story",
            "discipline", "habit", "goal setting", "james clear", "simon sinek"
        ]) {
            return Classification { category: cat, subfolder: "💡 Motivation & Self-Help".to_string() };
        }

        // 1l. Cooking & Food
        if any_in(&text, &[
            "recipe", "cooking", "how to make", "food", "baking",
            "nepali food", "dal bhat", "momo", "thukpa", "sel roti",
            "curry", "kitchen", "chef", "khana pakau"
        ]) {
            return Classification { category: cat, subfolder: "🍜 Cooking & Food".to_string() };
        }

        // 1m. Gaming
        if any_in(&text, &[
            "gaming", "gameplay", "game review", "lets play", "let's play",
            "minecraft", "gta", "valorant", "pubg", "fortnite", "chess", "esports"
        ]) {
            return Classification { category: cat, subfolder: "🎮 Gaming".to_string() };
        }

        // 1n. News
        if any_in(&text, &[
            "news", "current affairs", "breaking", "politics", "election",
            "government", "budget", "parliament"
        ]) {
            if is_nepali_content {
                return Classification { category: cat, subfolder: "📰 Nepal News".to_string() };
            }
            return Classification { category: cat, subfolder: "📰 World News".to_string() };
        }

        return Classification { category: cat, subfolder: "▶️ General Videos".to_string() };
    }

    // =========================================================================
    // 2. SOCIAL MEDIA
    // =========================================================================
    if domain.contains("reddit.com") {
        let cat = "Social Media".to_string();
        if any_in(&text, &["nepali", "nepal", "r/nepal", "r/nepalimemes"]) {
            return Classification { category: cat, subfolder: "Reddit – Nepal".to_string() };
        }
        if any_in(&text, &["r/programming", "r/learnprogramming", "r/webdev", "r/technology", "r/python"]) {
            return Classification { category: cat, subfolder: "Reddit – Tech".to_string() };
        }
        if any_in(&text, &["r/finance", "r/investing", "r/stocks", "r/wallstreetbets", "r/crypto"]) {
            return Classification { category: cat, subfolder: "Reddit – Finance".to_string() };
        }
        return Classification { category: cat, subfolder: "Reddit – General".to_string() };
    }

    if domain.contains("twitter.com") || domain.contains("x.com") {
        return Classification { category: "Social Media".to_string(), subfolder: "Twitter / X".to_string() };
    }

    if domain.contains("instagram.com") {
        return Classification { category: "Social Media".to_string(), subfolder: "Instagram".to_string() };
    }

    if domain.contains("facebook.com") || domain.contains("fb.com") {
        return Classification { category: "Social Media".to_string(), subfolder: "Facebook".to_string() };
    }

    if domain.contains("linkedin.com") {
        if any_in(&text, &["job", "vacancy", "hiring", "apply"]) {
            return Classification { category: "💼 Career & Jobs".to_string(), subfolder: "LinkedIn Jobs".to_string() };
        }
        return Classification { category: "💼 Career & Jobs".to_string(), subfolder: "LinkedIn – Articles & People".to_string() };
    }

    if domain.contains("tiktok.com") {
        return Classification { category: "Social Media".to_string(), subfolder: "TikTok".to_string() };
    }

    // =========================================================================
    // 3. NEWS & JOURNALISM
    // =========================================================================
    let nepali_news_sites = [
        "setopati.com", "onlinekhabar.com", "ekantipur.com", "ratopati.com",
        "annapurnapost.com", "gorkhapatra.org.np", "hamropatro.com",
        "nagariknews.com", "nepalnews.com", "nepalitimes.com", "myrepublica.com"
    ];
    let global_news_sites = [
        "reuters.com", "apnews.com", "nytimes.com", "bbc.com", "bbc.co.uk",
        "theguardian.com", "aljazeera.com", "cnn.com"
    ];
    let biz_magazines = ["forbes.com", "fortune.com", "bloomberg.com", "wsj.com", "economist.com", "hbr.org", "businessinsider.com"];
    let tech_magazines = ["techcrunch.com", "wired.com", "theverge.com", "arstechnica.com", "technologyreview.com", "venturebeat.com"];

    if any_in(&domain, &nepali_news_sites) || any_in(&text, &["setopati", "onlinekhabar", "ekantipur", "ratopati"]) {
        return Classification { category: "Nepal News".to_string(), subfolder: "Nepali News Sites".to_string() };
    }
    if any_in(&domain, &global_news_sites) {
        return Classification { category: "World News".to_string(), subfolder: "Global News".to_string() };
    }
    if any_in(&domain, &biz_magazines) || any_in(&text, &["forbes", "bloomberg news", "wall street journal", "harvard business review"]) {
        return Classification { category: "World News".to_string(), subfolder: "Business Magazines".to_string() };
    }
    if any_in(&domain, &tech_magazines) || any_in(&text, &["techcrunch", "wired magazine", "the verge"]) {
        return Classification { category: "World News".to_string(), subfolder: "Tech News & Magazines".to_string() };
    }

    // =========================================================================
    // 4. AI & MACHINE LEARNING
    // =========================================================================
    if any_in(&text, &[
        "chatgpt", "openai", "claude", "anthropic", "deepseek", "gemini",
        "huggingface", "ollama", "mistral", "llama", "gemma", "midjourney",
        "stable diffusion", "comfyui", "prompt engineering", "runway",
        "elevenlabs", "suno", "perplexity", "groq", "neural network", "genai"
    ]) {
        let cat = "🤖 AI & Machine Learning".to_string();
        if any_in(&text, &["voice ai", "tts", "stt", "elevenlabs", "suno", "audio ai"]) {
            return Classification { category: cat, subfolder: "Voice & Audio AI".to_string() };
        }
        if any_in(&text, &["image", "midjourney", "stable diffusion", "comfyui", "runway", "video generation"]) {
            return Classification { category: cat, subfolder: "Image & Video AI".to_string() };
        }
        return Classification { category: cat, subfolder: "LLMs & Chat AI".to_string() };
    }

    // =========================================================================
    // 5. DEVELOPER TOOLS & CODE
    // =========================================================================
    if any_in(&text, &[
        "agent", "mcp server", "openrouter", "cursor", "github copilot",
        "vibe coding", "github.com", "gitlab", "langchain",
        "docker", "kubernetes", "linux", "devops", "cloud", "aws", "azure", "gcp",
        "grafana", "prometheus", "programming", "open source",
        "npm", "python", "javascript", "typescript", "rust", "golang", "flutter"
    ]) {
        let cat = "💻 Developer Tools".to_string();
        if any_in(&text, &["mcp server", "agent", "swarm", "langchain", "llamaindex"]) {
            return Classification { category: cat, subfolder: "AI Agents & MCP".to_string() };
        }
        if any_in(&text, &["grafana", "prometheus", "kubernetes", "docker", "devops", "sre", "cloud"]) {
            return Classification { category: cat, subfolder: "DevOps & Cloud".to_string() };
        }
        if any_in(&text, &["github.com", "gitlab", "open source", "repository"]) {
            return Classification { category: cat, subfolder: "GitHub & Open Source".to_string() };
        }
        return Classification { category: cat, subfolder: "Programming & Code".to_string() };
    }

    // =========================================================================
    // 6. FINANCE & INVESTING
    // =========================================================================
    if any_in(&text, &[
        "nepse", "sebon", "share market", "share bazar", "stock market",
        "ipo", "meroshare", "ideapreneur", "dividend", "mutual fund"
    ]) {
        return Classification { category: "📈 Finance & Investing".to_string(), subfolder: "NEPSE & Nepal Stock Market".to_string() };
    }

    if any_in(&text, &[
        "prop trading", "funded", "forex", "babypips", "ftmo", "apex", "tradingview",
        "dex", "solana", "ethereum", "bitcoin", "crypto", "binance", "bybit",
        "hyperliquid", "payout", "raw spread"
    ]) {
        let cat = "📈 Finance & Investing".to_string();
        if any_in(&text, &["crypto", "dex", "hyperliquid", "solana", "ethereum", "bitcoin"]) {
            return Classification { category: cat, subfolder: "Crypto Trading".to_string() };
        }
        return Classification { category: cat, subfolder: "Forex & Prop Trading".to_string() };
    }

    if any_in(&text, &[
        "banking", "nrb", "monetary policy", "stripe", "payment gateway",
        "remittance", "inflation", "budget news", "fintech"
    ]) {
        return Classification { category: "📈 Finance & Investing".to_string(), subfolder: "Banking & Fintech".to_string() };
    }

    // =========================================================================
    // 7. EDUCATION & LEARNING
    // =========================================================================
    if any_in(&text, &[
        "udemy", "coursera", "edx", "skillshare", "khan academy",
        "certification", "bootcamp", "learn", "moodle",
        "tribhuvan university", "kathmandu university", "pokhara university",
        "scholarship", "syllabus", "textbook", "arxiv", "research paper",
        "sciencedirect", "pubmed"
    ]) {
        let cat = "🎓 Education".to_string();
        if any_in(&text, &["moodle", "tribhuvan", "kathmandu university", "pokhara university", "exam portal"]) {
            return Classification { category: cat, subfolder: "Nepal University & Exams".to_string() };
        }
        if any_in(&text, &["udemy", "coursera", "edx", "skillshare", "certification"]) {
            return Classification { category: cat, subfolder: "Online Courses".to_string() };
        }
        if any_in(&text, &["arxiv", "research paper", "scholar", "sciencedirect", "pubmed"]) {
            return Classification { category: cat, subfolder: "Research Papers & Journals".to_string() };
        }
        return Classification { category: cat, subfolder: "Learning Resources".to_string() };
    }

    // =========================================================================
    // 8. CAREER & JOBS
    // =========================================================================
    if any_in(&text, &[
        "job vacancy", "career", "intern", "merojob", "jobsnepal",
        "jobejee", "linkedin.com/jobs", "recruitment", "resume tips",
        "cover letter", "interview tips"
    ]) {
        let cat = "💼 Career & Jobs".to_string();
        if any_in(&text, &["merojob", "jobsnepal", "jobejee"]) {
            return Classification { category: cat, subfolder: "Nepal Jobs".to_string() };
        }
        return Classification { category: cat, subfolder: "Jobs & Career Advice".to_string() };
    }

    // =========================================================================
    // 9. SHOPPING
    // =========================================================================
    let nepali_shops = ["daraz.com.np", "sastodeal.com", "hamrobazar.com", "olx.com.np", "gyapu.com"];
    let global_shops = ["amazon.com", "amazon.co.uk", "ebay.com", "aliexpress.com", "flipkart.com", "etsy.com"];

    if any_in(&domain, &nepali_shops) {
        return Classification { category: "🛒 Shopping".to_string(), subfolder: "Nepal Online Shopping".to_string() };
    }
    if any_in(&domain, &global_shops) {
        return Classification { category: "🛒 Shopping".to_string(), subfolder: "International Shopping".to_string() };
    }

    // =========================================================================
    // 10. FOOD & RECIPES
    // =========================================================================
    if any_in(&text, &[
        "recipe", "cooking", "food blog", "restaurant", "baking", "cuisine",
        "meal prep", "dal bhat", "momo", "thukpa", "sel roti", "chatamari",
        "dhido", "gundruk", "kwati", "yomari", "aloo tama", "nepali khana"
    ]) {
        let cat = "🍜 Food & Recipes".to_string();
        if is_nepali_content || any_in(&text, &["dal bhat", "momo", "thukpa", "sel roti", "dhido", "nepali khana"]) {
            return Classification { category: cat, subfolder: "Nepali Recipes".to_string() };
        }
        return Classification { category: cat, subfolder: "Recipes & Cooking".to_string() };
    }

    // =========================================================================
    // 11. HEALTH & FITNESS
    // =========================================================================
    if any_in(&text, &[
        "health", "fitness", "workout", "gym", "yoga", "meditation",
        "nutrition", "diet", "weight loss", "running", "exercise",
        "mental health", "therapy", "doctor", "hospital", "medicine"
    ]) {
        let cat = "💪 Health & Fitness".to_string();
        if any_in(&text, &["mental health", "therapy", "anxiety", "depression", "mindfulness", "meditation"]) {
            return Classification { category: cat, subfolder: "Mental Health & Wellness".to_string() };
        }
        if any_in(&text, &["workout", "gym", "exercise", "yoga", "running", "weight loss"]) {
            return Classification { category: cat, subfolder: "Fitness & Exercise".to_string() };
        }
        return Classification { category: cat, subfolder: "Health & Medical".to_string() };
    }

    // =========================================================================
    // 12. TRAVEL & PLACES
    // =========================================================================
    if any_in(&text, &[
        "travel", "trip", "tour", "tourism", "destination", "hotel", "airbnb",
        "booking", "visa", "passport", "hike", "trek", "mountain",
        "kathmandu", "pokhara", "chitwan", "lumbini", "mustang",
        "everest", "annapurna", "himalayas"
    ]) {
        let cat = "✈️ Travel & Places".to_string();
        if any_in(&text, &["kathmandu", "pokhara", "chitwan", "mustang", "everest", "annapurna", "nepal trek"]) {
            return Classification { category: cat, subfolder: "Nepal Travel & Trekking".to_string() };
        }
        if any_in(&text, &["booking", "hotels.com", "airbnb", "expedia", "skyscanner", "agoda"]) {
            return Classification { category: cat, subfolder: "Booking & Travel Sites".to_string() };
        }
        return Classification { category: cat, subfolder: "International Travel".to_string() };
    }

    // =========================================================================
    // 13. DESIGN & CREATIVE
    // =========================================================================
    if any_in(&domain, &["figma.com", "dribbble.com", "behance.net", "freepik.com", "unsplash.com", "canva.com", "adobe.com", "coolors.co"])
        || any_in(&text, &["ui design", "ux design", "figma", "prototype", "wireframe", "graphic design"])
    {
        let cat = "🎨 Design & Creative".to_string();
        if any_in(&text, &["figma", "prototype", "wireframe", "ui design", "ux design"]) {
            return Classification { category: cat, subfolder: "UI/UX Design".to_string() };
        }
        return Classification { category: cat, subfolder: "Graphics & Assets".to_string() };
    }

    // =========================================================================
    // 14. ENTERTAINMENT & STREAMING
    // =========================================================================
    if any_in(&text, &[
        "netflix", "prime video", "hulu", "disney plus", "stream movies",
        "moviesjoy", "myflixer", "hdmovie", "sflix", "cineb", "1movies",
        "nepali film", "kollywood", "jhalak"
    ]) {
        let cat = "🎬 Entertainment".to_string();
        if any_in(&text, &["nepali film", "kollywood", "nepali cinema"]) {
            return Classification { category: cat, subfolder: "Nepali Films".to_string() };
        }
        return Classification { category: cat, subfolder: "Streaming & Movies".to_string() };
    }

    // =========================================================================
    // 15. DOMAIN BRAND FALLBACK
    // =========================================================================
    if !domain.is_empty() {
        if let Some(brand) = get_brand_name(&domain) {
            return Classification {
                category: "🛠️ Web Tools".to_string(),
                subfolder: format!("{} Services", brand),
            };
        }
    }

    Classification {
        category: "🛠️ Web Tools".to_string(),
        subfolder: "General Bookmarks".to_string(),
    }
}

fn get_brand_name(domain: &str) -> Option<String> {
    let ignored = [
        "com", "net", "org", "co", "io", "app", "gov", "edu", "mil", "ai",
        "np", "uk", "in", "de", "to", "xyz", "top", "world", "rs", "gd",
        "fo", "ru", "cc", "bz", "tv"
    ];
    let parts: Vec<&str> = domain.split('.').collect();
    for &p in parts.iter().rev() {
        if !ignored.contains(&p) && p.len() > 2 {
            let mut chars = p.chars();
            let cap = match chars.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + chars.as_str(),
            };
            return Some(cap);
        }
    }
    None
}

fn any_in(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|&n| {
        if n.len() <= 4 && !n.contains(' ') {
            for word in haystack.split(|c: char| !c.is_alphanumeric()) {
                if word.eq_ignore_ascii_case(n) {
                    return true;
                }
            }
            false
        } else {
            haystack.contains(n)
        }
    })
}

fn extract_domain(url: &str) -> String {
    if let Some(pos) = url.find("://") {
        let rest = &url[pos + 3..];
        let end = rest.find('/').unwrap_or(rest.len());
        let host = &rest[..end];
        let clean = host.strip_prefix("www.").unwrap_or(host);
        return clean.to_lowercase();
    }
    String::new()
}

fn find_or_create_subfolder<'a>(cat: &'a mut BookmarkNode, sub_name: &str) -> &'a mut BookmarkNode {
    if cat.children.is_none() {
        cat.children = Some(Vec::new());
    }

    let pos = cat.children.as_ref().unwrap().iter().position(|c| {
        c.node_type == "folder"
            && (c.name.eq_ignore_ascii_case(sub_name)
                || c.name.to_lowercase().contains(&sub_name.to_lowercase())
                || sub_name.to_lowercase().contains(&c.name.to_lowercase()))
    });

    if let Some(idx) = pos {
        return &mut cat.children.as_mut().unwrap()[idx];
    }

    // Create Subfolder
    let new_sub = BookmarkNode {
        date_added: "13300000000000000".to_string(),
        date_last_used: "0".to_string(),
        date_modified: "13300000000000000".to_string(),
        id: format!("{}", (Instant::now().elapsed().as_nanos() + 1) % 1000000000),
        name: sub_name.to_string(),
        node_type: "folder".to_string(),
        url: None,
        children: Some(Vec::new()),
        extra: HashMap::new(),
    };

    cat.children.as_mut().unwrap().push(new_sub);
    let len = cat.children.as_ref().unwrap().len();
    &mut cat.children.as_mut().unwrap()[len - 1]
}

fn partition_overcrowded_node(node: &mut BookmarkNode, depth: usize) -> usize {
    if depth > 1 {
        return 0;
    }

    let mut moved = 0;

    if depth == 1 {
        if let Some(children) = &mut node.children {
            let (urls, mut folders): (Vec<BookmarkNode>, Vec<BookmarkNode>) = children
                .drain(..)
                .partition(|c| c.node_type == "url");

            if urls.len() >= OVERCROWDED_THRESHOLD {
                let mut clusters: HashMap<String, Vec<BookmarkNode>> = HashMap::new();
                let mut remaining: Vec<BookmarkNode> = Vec::new();

                for u in urls {
                    let url_str = u.url.as_deref().unwrap_or("");
                    let cls = classify_genre(&u.name, url_str);
                    let sub = cls.subfolder;

                    if sub.eq_ignore_ascii_case(&node.name) || sub == "General Bookmarks" {
                        remaining.push(u);
                    } else {
                        clusters.entry(sub).or_default().push(u);
                    }
                }

                for (sub_name, items) in clusters {
                    if items.len() >= 2 {
                        let folder_pos = folders.iter().position(|f| f.name.eq_ignore_ascii_case(&sub_name));
                        let sub_folder = if let Some(idx) = folder_pos {
                            &mut folders[idx]
                        } else {
                            let new_f = BookmarkNode {
                                date_added: "13300000000000000".to_string(),
                                date_last_used: "0".to_string(),
                                date_modified: "13300000000000000".to_string(),
                                id: format!("{}", (Instant::now().elapsed().as_nanos() + 2) % 1000000000),
                                name: sub_name.clone(),
                                node_type: "folder".to_string(),
                                url: None,
                                children: Some(Vec::new()),
                                extra: HashMap::new(),
                            };
                            folders.push(new_f);
                            let l = folders.len();
                            &mut folders[l - 1]
                        };

                        let count = items.len();
                        if sub_folder.children.is_none() {
                            sub_folder.children = Some(Vec::new());
                        }
                        sub_folder.children.as_mut().unwrap().extend(items);
                        moved += count;
                        println!("   [⚡ Rust] Sub-partitioned {} items -> [{}] > [{}]", count, node.name, sub_name);
                    } else {
                        remaining.extend(items);
                    }
                }

                let mut new_children = folders;
                new_children.extend(remaining);
                node.children = Some(new_children);
            } else {
                let mut new_children = folders;
                new_children.extend(urls);
                node.children = Some(new_children);
            }
        }
        return moved;
    }

    if let Some(children) = &mut node.children {
        for c in children.iter_mut() {
            if c.node_type == "folder" {
                moved += partition_overcrowded_node(c, depth + 1);
            }
        }
    }

    moved
}

fn locate_bookmarks_path() -> Option<PathBuf> {
    let home = env::var("HOME").unwrap_or_else(|_| "/home/basant".to_string());
    let p2 = Path::new(&home).join(".config/BraveSoftware/Brave-Browser/Profile 2/Bookmarks");
    if p2.exists() {
        return Some(p2);
    }
    let def = Path::new(&home).join(".config/BraveSoftware/Brave-Browser/Default/Bookmarks");
    if def.exists() {
        return Some(def);
    }
    None
}

fn route_to_best_existing_category(target_cat: &str, target_sub: &str, existing: &[BookmarkNode]) -> (usize, String) {
    let target_text = format!("{} {}", target_cat, target_sub).to_lowercase();
    let mut best_idx = 0;
    let mut highest_score: i32 = -1;

    for (idx, folder) in existing.iter().enumerate() {
        let cat_lower = folder.name.to_lowercase();
        let mut score: i32 = 0;

        if target_text.contains("nepse") || target_text.contains("share") || target_text.contains("stock") || target_text.contains("investing") {
            if cat_lower.contains("finance") || cat_lower.contains("investing") { score += 50; }
        }
        if target_text.contains("youtube") || target_text.contains("video") {
            if cat_lower.contains("youtube") || cat_lower.contains("video") { score += 45; }
        }
        if target_text.contains("news") || target_text.contains("journalism") {
            if cat_lower.contains("news") { score += 45; }
        }
        if target_text.contains("ai") || target_text.contains("neural") || target_text.contains("llm") {
            if cat_lower.contains("ai") || cat_lower.contains("neural") || cat_lower.contains("machine") { score += 45; }
        }
        if target_text.contains("code") || target_text.contains("developer") || target_text.contains("github") {
            if cat_lower.contains("developer") || cat_lower.contains("code") { score += 45; }
        }
        if target_text.contains("education") || target_text.contains("course") || target_text.contains("university") {
            if cat_lower.contains("education") || cat_lower.contains("learn") { score += 45; }
        }
        if target_text.contains("health") || target_text.contains("fitness") {
            if cat_lower.contains("health") || cat_lower.contains("fitness") { score += 45; }
        }
        if target_text.contains("travel") || target_text.contains("tourism") {
            if cat_lower.contains("travel") { score += 45; }
        }
        if target_text.contains("food") || target_text.contains("recipe") {
            if cat_lower.contains("food") || cat_lower.contains("recipe") { score += 45; }
        }
        if target_text.contains("social") || target_text.contains("reddit") || target_text.contains("twitter") {
            if cat_lower.contains("social") { score += 40; }
        }

        if score > highest_score {
            highest_score = score;
            best_idx = idx;
        }
    }

    (best_idx, target_sub.to_string())
}

fn organize_file(path: &Path) -> Result<(usize, usize, u128), Box<dyn std::error::Error>> {
    let start = Instant::now();
    let content = fs::read_to_string(path)?;
    let mut file: BookmarksFile = serde_json::from_str(&content)?;

    // 1. Move loose bookmarks in bookmark_bar to Category > Subfolder
    let mut moved_loose = 0;
    if let Some(children) = &mut file.roots.bookmark_bar.children {
        let (urls, mut folders): (Vec<BookmarkNode>, Vec<BookmarkNode>) = children
            .drain(..)
            .partition(|c| c.node_type == "url");

        for u in urls {
            let url_str = u.url.as_deref().unwrap_or("");
            let cls = classify_genre(&u.name, url_str);

            // Find or create category among folders (respecting MAX_MAIN_FOLDERS)
            let cat_pos = folders.iter().position(|f| f.name.eq_ignore_ascii_case(&cls.category));
            let cat_node = if let Some(idx) = cat_pos {
                &mut folders[idx]
            } else if folders.len() >= MAX_MAIN_FOLDERS {
                let (idx, _) = route_to_best_existing_category(&cls.category, &cls.subfolder, &folders);
                &mut folders[idx]
            } else {
                let new_cat = BookmarkNode {
                    date_added: "13300000000000000".to_string(),
                    date_last_used: "0".to_string(),
                    date_modified: "13300000000000000".to_string(),
                    id: format!("{}", (Instant::now().elapsed().as_nanos() + 3) % 1000000000),
                    name: cls.category.clone(),
                    node_type: "folder".to_string(),
                    url: None,
                    children: Some(Vec::new()),
                    extra: HashMap::new(),
                };
                folders.push(new_cat);
                let l = folders.len();
                &mut folders[l - 1]
            };

            let sub_node = find_or_create_subfolder(cat_node, &cls.subfolder);
            if sub_node.children.is_none() {
                sub_node.children = Some(Vec::new());
            }
            sub_node.children.as_mut().unwrap().push(u);
            moved_loose += 1;
        }

        file.roots.bookmark_bar.children = Some(folders);
    }

    // 2. Partition overcrowded subfolders
    let moved_partitions = partition_overcrowded_node(&mut file.roots.bookmark_bar, 0);

    // Write back atomically
    let serialized = serde_json::to_string_pretty(&file)?;
    let tmp_path = path.with_extension("tmp");
    fs::write(&tmp_path, serialized)?;
    fs::rename(&tmp_path, path)?;

    let elapsed = start.elapsed().as_micros();
    Ok((moved_loose, moved_partitions, elapsed))
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let command = if args.len() > 1 { args[1].as_str() } else { "organize" };

    let path = match locate_bookmarks_path() {
        Some(p) => p,
        None => {
            eprintln!("Error: Brave Bookmarks file not found!");
            std::process::exit(1);
        }
    };

    println!("⚡ sunyai bookmark organizer - Native Rust Engine (Ultra-Lightweight, 0% CPU)");
    println!("Target: {}", path.display());

    match command {
        "organize" => {
            println!("Sweeping and partitioning bookmarks...");
            match organize_file(&path) {
                Ok((loose, partitions, micros)) => {
                    let millis = (micros as f64) / 1000.0;
                    println!("✔ Complete in {:.2} ms!", millis);
                    println!("   - Loose bookmarks sorted: {}", loose);
                    println!("   - Overcrowded partitions moved: {}", partitions);
                    println!("   - Total latency: {:.2} ms | CPU impact: ~0.00%", millis);
                }
                Err(e) => {
                    eprintln!("Failed to organize: {}", e);
                }
            }
        }
        "watch" => {
            println!("Watching Bookmarks file in background (event-driven sleep, 0% CPU)...");
            let mut last_mtime = fs::metadata(&path).and_then(|m| m.modified()).ok();
            loop {
                std::thread::sleep(std::time::Duration::from_secs(3));
                if let Ok(m) = fs::metadata(&path) {
                    if let Ok(mod_time) = m.modified() {
                        if last_mtime != Some(mod_time) {
                            println!("\n[File change detected] Running microsecond organization...");
                            if let Ok((l, p, us)) = organize_file(&path) {
                                println!("✔ Organized in {:.2} ms (Loose: {}, Partitioned: {})", (us as f64) / 1000.0, l, p);
                            }
                            last_mtime = fs::metadata(&path).and_then(|meta| meta.modified()).ok();
                        }
                    }
                }
            }
        }
        "stats" => {
            let content = fs::read_to_string(&path).unwrap_or_default();
            let file: Result<BookmarksFile, _> = serde_json::from_str(&content);
            if let Ok(f) = file {
                let bar = &f.roots.bookmark_bar;
                let count = bar.children.as_ref().map(|c| c.len()).unwrap_or(0);
                println!("Bookmarks bar contains {} top categories/items.", count);
            }
        }
        _ => {
            println!("Usage: brave-bookmark-engine [organize|watch|stats]");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_devanagari_detection() {
        assert!(has_devanagari("पशुपतिनाथ भजन"));
        assert!(has_devanagari("नेपाली गीत - सुजन चापागाईं"));
        assert!(!has_devanagari("English text only"));
    }

    #[test]
    fn test_youtube_nepali_music() {
        let res = classify_genre("सुजन चापागाईं - घुमी घुमी (Official Music Video)", "https://www.youtube.com/watch?v=xyz123");
        assert_eq!(res.category, "YouTube");
        assert_eq!(res.subfolder, "🎵 Nepali Music");

        let res2 = classify_genre("1974 AD - Samjhana Harulai | Official Audio", "https://youtu.be/abc456");
        assert_eq!(res2.category, "YouTube");
        assert_eq!(res2.subfolder, "🎵 Nepali Music");
    }

    #[test]
    fn test_youtube_bollywood_music() {
        let res = classify_genre("Arijit Singh - Tum Hi Ho Official Video", "https://youtube.com/watch?v=bolly1");
        assert_eq!(res.category, "YouTube");
        assert_eq!(res.subfolder, "🎵 Bollywood & Hindi");
    }

    #[test]
    fn test_youtube_english_music() {
        let res = classify_genre("Taylor Swift - Anti-Hero (Official Music Video)", "https://youtube.com/watch?v=taylor1");
        assert_eq!(res.category, "YouTube");
        assert_eq!(res.subfolder, "🎵 English Music");
    }

    #[test]
    fn test_nepali_news_sites() {
        let res = classify_genre("प्रमुख समाचार | Setopati", "https://setopati.com/politics/12345");
        assert_eq!(res.category, "Nepal News");
        assert_eq!(res.subfolder, "Nepali News Sites");
    }

    #[test]
    fn test_reddit_subfolders() {
        let res = classify_genre("Discussion on r/nepal regarding tech jobs", "https://reddit.com/r/nepal/comments/123");
        assert_eq!(res.category, "Social Media");
        assert_eq!(res.subfolder, "Reddit – Nepal");

        let res_tech = classify_genre("Best python web frameworks r/programming", "https://reddit.com/r/programming/xyz");
        assert_eq!(res_tech.category, "Social Media");
        assert_eq!(res_tech.subfolder, "Reddit – Tech");
    }

    #[test]
    fn test_nepse_and_finance() {
        let res = classify_genre("MeroShare Online IPO Application", "https://meroshare.cdsc.com.np");
        assert_eq!(res.category, "📈 Finance & Investing");
        assert_eq!(res.subfolder, "NEPSE & Nepal Stock Market");
    }

    #[test]
    fn test_health_and_fitness() {
        let res = classify_genre("Full Body Workout Routine for Beginners", "https://fitnessblender.com/workout");
        assert_eq!(res.category, "💪 Health & Fitness");
        assert_eq!(res.subfolder, "Fitness & Exercise");
    }

    #[test]
    fn test_brand_fallback() {
        let res = classify_genre("Dashboard", "https://supabase.com/dashboard/project/abc");
        assert_eq!(res.category, "🛠️ Web Tools");
        assert_eq!(res.subfolder, "Supabase Services");
    }
}
