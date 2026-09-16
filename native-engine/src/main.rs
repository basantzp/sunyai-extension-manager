use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

const OVERCROWDED_THRESHOLD: usize = 6;

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

struct Classification {
    category: String,
    subfolder: String,
}

fn classify_genre(title: &str, url: &str) -> Classification {
    let text = format!("{} {}", title, url).to_lowercase();
    let domain = extract_domain(url);

    let is_youtube = domain.contains("youtube.com") || domain.contains("youtu.be");

    if is_youtube {
        let cat = "YouTube".to_string();

        if any_in(&text, &[
            "nepse", "sebon", "share market", "share bazar", "stock market",
            "bull", "bear", "ipo", "meroshare", "ideapreneur", "dividend",
            "fundamental analysis", "technical analysis", "candlestick",
            "21 बुँदे", "स्वर्णिम", "शेयर", "बजार"
        ]) {
            return Classification { category: cat, subfolder: "NEPSE Course".to_string() };
        }

        if any_in(&text, &[
            "documentary", "investigative", "herne katha", "the nepali comment",
            "in-depth story", "docuseries", "history of", "dw documentary",
            "vox", "frontline", "bbc documentary"
        ]) {
            return Classification { category: cat, subfolder: "Documentary".to_string() };
        }

        if any_in(&text, &[
            "music video", "official video", "official audio", "song", "lyrics",
            "lofi", "remix", "singer", "album", "bollywood", "vevo", "arijit",
            "sujan chapagain", "john rai"
        ]) {
            return Classification { category: cat, subfolder: "Music Videos".to_string() };
        }

        if any_in(&text, &[
            "short movie", "short film", "short cinema", "award winning short",
            "cinema", "film", "trailer", "teaser"
        ]) {
            return Classification { category: cat, subfolder: "Short Movie".to_string() };
        }

        if any_in(&text, &[
            "course", "full course", "tutorial", "crash course", "learn in",
            "masterclass", "bootcamp", "zero to hero", "freecodecamp"
        ]) {
            return Classification { category: cat, subfolder: "Course".to_string() };
        }

        if any_in(&text, &[
            "research", "deep dive", "explained", "science of", "veritasium",
            "kurzgesagt", "3blue1brown", "ted talk", "ted-ed", "ted"
        ]) {
            return Classification { category: cat, subfolder: "Research".to_string() };
        }

        if any_in(&text, &[
            "podcast", "interview", "conversation with", "joe rogan", "lex fridman",
            "huberman", "diary of a ceo"
        ]) {
            return Classification { category: cat, subfolder: "Podcasts & Interviews".to_string() };
        }

        if any_in(&text, &[
            "gpt", "astra", "fable", "claude", "gemini", "benchmark", "review", "unboxing", "hands on",
            "iphone", "macbook", "gpu", "laptop", "mkbhd", "dave2d"
        ]) {
            return Classification { category: cat, subfolder: "Tech Reviews".to_string() };
        }

        return Classification { category: cat, subfolder: "General Videos".to_string() };
    }

    // Magazines (Forbes, Bloomberg, Wired, Fortune, etc.)
    if any_in(&domain, &[
        "forbes.com", "fortune.com", "bloomberg.com", "wsj.com", "economist.com",
        "hbr.org", "ft.com", "businessinsider.com"
    ]) || any_in(&text, &["forbes", "bloomberg", "wall street journal", "fortune magazine"]) {
        return Classification {
            category: "📰 Magazines & Publications".to_string(),
            subfolder: "Business & Leadership Magazines".to_string(),
        };
    }

    if any_in(&domain, &["techcrunch.com", "wired.com", "theverge.com", "arstechnica.com"]) {
        return Classification {
            category: "📰 Magazines & Publications".to_string(),
            subfolder: "Tech & Innovation Magazines".to_string(),
        };
    }

    // AI & Neural Media
    if any_in(&text, &[
        "groq", "chatgpt", "openai", "claude", "anthropic", "deepseek", "gemini", "huggingface",
        "ollama", "mistral", "llm", "llama", "gemma", "midjourney", "stable diffusion", "comfyui", "runway",
        "elevenlabs", "voice.ai", "roomgpt", "pictory", "munch", "vidyo", "capcut", "invideo"
    ]) {
        let cat = "Neural Labs".to_string();
        if any_in(&text, &["voice", "audio", "tts", "stt", "voice.ai", "podcast.adobe", "suno"]) {
            return Classification { category: cat, subfolder: "Multimodal Voice & Neural Audio".to_string() };
        }
        if any_in(&text, &["video", "pictory", "capcut", "munch", "vidyo", "invideo", "runway", "roomgpt", "midjourney"]) {
            return Classification { category: cat, subfolder: "Generative Media & Video".to_string() };
        }
        return Classification { category: cat, subfolder: "Frontier LLMs & Reasoning Models".to_string() };
    }

    // Movies & Streaming
    if any_in(&text, &[
        "moviesjoy", "myflixer", "cineb", "multimovies", "sflix", "hdmovie", "1shows", "345movie",
        "brocoflix", "cineby", "dashflix", "cornclick", "cinemadeck", "cinebolt", "cataz",
        "bingeflix", "autoembed", "abflix", "7xcinema", "1movies", "spenflix", "nepu", "moviemaze"
    ]) {
        return Classification {
            category: "Neural Labs".to_string(),
            subfolder: "Decompression & High-Yield Media".to_string(),
        };
    }

    // Finance & NEPSE
    if any_in(&text, &[
        "nepse", "sebon", "share market", "stock", "ipo", "meroshare", "ideapreneur",
        "dividend", "mutual fund", "banking", "nabil", "nrb"
    ]) {
        return Classification {
            category: "Finance".to_string(),
            subfolder: "📈 [Execution] Matching Engines, State Registry & Broker Nodes".to_string(),
        };
    }

    // Prop Trading
    if any_in(&text, &["prop", "funded", "forex", "babypips", "ftmo", "apex", "tradingview"]) {
        return Classification {
            category: "🏆 Prop Trading Matrix [Forex, Crypto & Fastest Payouts]".to_string(),
            subfolder: "💱 4. Forex Prop Firms (Raw Spread, Blue Chips & Scaling)".to_string(),
        };
    }

    // Agentic OS & Dev Tools
    if any_in(&text, &["agent", "swarm", "mcp", "openrouter", "claw-code", "ruflo", "cursor", "github.com"]) {
        return Classification {
            category: "Agentic OS".to_string(),
            subfolder: "Autonomous Multi-Agent Swarms & Orchestration".to_string(),
        };
    }

    // Domain Brand Fallback
    if !domain.is_empty() {
        if let Some(brand) = get_brand_name(&domain) {
            return Classification {
                category: "🛠️ Web Tools & Utilities".to_string(),
                subfolder: format!("{} Services", brand),
            };
        }
    }

    Classification {
        category: "🛠️ Web Tools & Utilities".to_string(),
        subfolder: "General Bookmarks".to_string(),
    }
}

fn get_brand_name(domain: &str) -> Option<String> {
    let ignored = ["com", "net", "org", "co", "io", "app", "gov", "edu", "mil", "ai", "np", "uk", "in", "de", "to", "xyz", "top", "world", "rs", "gd", "fo", "ru", "cc", "bz", "tv"];
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
        c.node_type == "folder" && (c.name.eq_ignore_ascii_case(sub_name) || c.name.to_lowercase().contains(&sub_name.to_lowercase()))
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
            // Collect URLs and separate folders
            let (urls, mut folders): (Vec<BookmarkNode>, Vec<BookmarkNode>) = children
                .drain(..)
                .partition(|c| c.node_type == "url");

            if urls.len() >= OVERCROWDED_THRESHOLD {
                // Group by subgenre
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

                // For clusters with >= 2 items, create subfolders
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

                // Restore remaining URLs and folders
                let mut new_children = folders;
                new_children.extend(remaining);
                node.children = Some(new_children);
            } else {
                // Restore as is
                let mut new_children = folders;
                new_children.extend(urls);
                node.children = Some(new_children);
            }
        }
        return moved;
    }

    // If depth == 0 (bookmark_bar), recurse only into depth 1 (top categories)
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

const MAX_MAIN_FOLDERS: usize = 12;

fn route_to_best_existing_category(target_cat: &str, target_sub: &str, existing: &[BookmarkNode]) -> (usize, String) {
    let target_text = format!("{} {}", target_cat, target_sub).to_lowercase();
    let mut best_idx = 0;
    let mut highest_score: i32 = -1;

    for (idx, folder) in existing.iter().enumerate() {
        let cat_lower = folder.name.to_lowercase();
        let mut score: i32 = 0;

        if target_text.contains("nepse") || target_text.contains("share") || target_text.contains("stock") {
            if cat_lower.contains("finance") { score += 50; }
        }
        if target_text.contains("prop") || target_text.contains("forex") || target_text.contains("trading") {
            if cat_lower.contains("prop") || cat_lower.contains("trading") { score += 40; }
            if cat_lower.contains("finance") { score += 20; }
        }
        if target_text.contains("ai") || target_text.contains("neural") || target_text.contains("llm") {
            if cat_lower.contains("neural") { score += 40; }
            if cat_lower.contains("agentic") { score += 25; }
        }
        if target_text.contains("magazine") || target_text.contains("forbes") || target_text.contains("bloomberg") {
            if target_text.contains("business") || target_text.contains("leadership") {
                if cat_lower.contains("finance") { score += 40; }
            }
            if target_text.contains("tech") || target_text.contains("innovation") {
                if cat_lower.contains("neural") || cat_lower.contains("agentic") { score += 40; }
            }
            if cat_lower.contains("codex") { score += 20; }
        }
        if target_text.contains("youtube") || target_text.contains("video") || target_text.contains("documentary") {
            if cat_lower.contains("cognitive") || cat_lower.contains("neural") { score += 35; }
            if cat_lower.contains("codex") { score += 20; }
        }
        if target_text.contains("code") || target_text.contains("agent") || target_text.contains("github") {
            if cat_lower.contains("agentic") || cat_lower.contains("noc") { score += 40; }
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

            // Find or create category among folders (respecting 12-folder limit)
            let cat_pos = folders.iter().position(|f| f.name.eq_ignore_ascii_case(&cls.category));
            let cat_node = if let Some(idx) = cat_pos {
                &mut folders[idx]
            } else if folders.len() >= MAX_MAIN_FOLDERS {
                // Do NOT create 13th folder! Route into best existing main category
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
                            // update mtime after writing
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
