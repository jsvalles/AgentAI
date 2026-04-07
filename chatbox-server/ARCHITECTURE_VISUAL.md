# 🎨 AI-Assisted Support Agent - Visual Architecture

## 📊 TECH STACK + ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          AI-ASSISTED SUPPORT AGENT - CELSIA                                     │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐        ┌─────────────────────────────────────────┐        ┌──────────────────────┐
│                      │        │         PROCESSING PIPELINE             │        │                      │
│   DATA SOURCES       │        │                                         │        │    USER INTERFACE    │
│                      │        │                                         │        │                      │
│  📚 CONFLUENCE       │───────▶│  ┌──────────────────────────────────┐  │───────▶│  👤 USER             │
│  • FAQs              │        │  │ 1️⃣ PARSE                        │  │        │                      │
│  • Videos (.mp4)     │        │  │ • HTML Tables                   │  │        │  ┌────────────────┐  │
│  • Procedures        │        │  │ • Decode entities               │  │        │  │                │  │
│                      │        │  │ • Extract Q&A                   │  │        │  │   CHAT UI      │  │
│  📊 EXCEL            │───────▶│  └──────────────────────────────────┘  │        │  │   (Browser)    │  │
│  • 1575 Cases        │        │              ↓                          │        │  │                │  │
│  • Historic data     │        │  ┌──────────────────────────────────┐  │        │  │  • Input       │  │
│  • Date: 2024-2025   │        │  │ 2️⃣ DETECT QUERY TYPE            │  │        │  │  • Display     │  │
│                      │        │  │ • Knowledge → Direct            │  │        │  │  • Options     │  │
│  🎫 JIRA             │        │  │ • Analysis → AI Process         │  │        │  │  • Videos 🎥   │  │
│  • Create tickets    │        │  └──────────────────────────────────┘  │        │  └────────────────┘  │
│  • Track issues      │        │              ↓                          │        │          ↕           │
│                      │        │                                         │        │  ┌────────────────┐  │
└──────────────────────┘        │         ┌──────────────┐                │        │  │  INTENT AGENT  │  │
                                │         │ KNOWLEDGE?   │                │        │  │                │  │
                                │         └──────┬───────┘                │        │  │ • Detect type  │  │
                                │            YES │   NO                   │        │  │ • Route query  │  │
                                │                │                        │        │  │ • Format resp  │  │
         ┌──────────────────────┼────────────────┴─────┬─────────────────┼────────┼──│ • Show videos  │  │
         │                      │                      │                 │        │  └────────────────┘  │
         ↓                      │                      ↓                 │        └──────────────────────┘
┌─────────────────────┐         │         ┌─────────────────────────┐   │
│                     │         │         │                         │   │
│  DIRECT RESPONSE    │         │         │    AI PROCESSING        │   │
│  (No AI)            │         │         │    (Claude AI)          │   │
│                     │         │         │                         │   │
│  ┌───────────────┐  │         │         │  ┌──────────────────┐   │   │
│  │ 3️⃣ SEARCH    │  │         │         │  │ 3️⃣ FILTER       │   │   │
│  │ • Confluence  │  │         │         │  │ • By date       │   │   │
│  │ • Excel       │  │         │         │  │ • Pre-process   │   │   │
│  └───────────────┘  │         │         │  └──────────────────┘   │   │
│         ↓           │         │         │           ↓              │   │
│  ┌───────────────┐  │         │         │  ┌──────────────────┐   │   │
│  │ 4️⃣ EXTRACT   │  │         │         │  │ 4️⃣ AGGREGATE    │   │   │
│  │ • Q&A pairs   │  │         │         │  │ • By specialist │   │   │
│  │ • Videos      │  │         │         │  │ • By status     │   │   │
│  └───────────────┘  │         │         │  │ • By subject    │   │   │
│         ↓           │         │         │  └──────────────────┘   │   │
│  ┌───────────────┐  │         │         │           ↓              │   │
│  │ 5️⃣ DETECT    │  │         │         │  ┌──────────────────┐   │   │
│  │ VIDEO         │  │         │         │  │ 5️⃣ SEND TO AI   │   │   │
│  │ • .mp4, .webm │  │         │         │  │                  │   │   │
│  │ • Make link   │  │         │         │  │ 🤖 Claude AI    │   │   │
│  └───────────────┘  │         │         │  │ Haiku Model     │   │   │
│         ↓           │         │         │  │ ~5K tokens      │   │   │
│  ┌───────────────┐  │         │         │  └──────────────────┘   │   │
│  │ 6️⃣ DISPLAY   │  │         │         │           ↓              │   │
│  │ • Show answer │  │         │         │  ┌──────────────────┐   │   │
│  │ • 🎥 Video    │  │         │         │  │ 6️⃣ GENERATE     │   │   │
│  │ • < 1 second  │  │         │         │  │ • Analysis      │   │   │
│  └───────────────┘  │         │         │  │ • Insights      │   │   │
│                     │         │         │  │ • Statistics    │   │   │
└─────────────────────┘         │         │  └──────────────────┘   │   │
                                │         │           ↓              │   │
                                │         │  ┌──────────────────┐   │   │
                                │         │  │ 7️⃣ DISPLAY      │   │   │
                                │         │  │ • Show results  │   │   │
                                │         │  │ • 3-5 seconds   │   │   │
                                │         │  └──────────────────┘   │   │
                                │         │                         │   │
                                │         └─────────────────────────┘   │
                                │                                       │
                                └───────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              TECHNOLOGY COMPONENTS                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

 FRONTEND                    BACKEND                       AI / SERVICES
┌─────────────┐          ┌──────────────┐            ┌──────────────────┐
│ HTML5       │          │ Node.js      │            │ Claude AI        │
│ JavaScript  │◀────────▶│ Express.js   │◀──────────▶│ (Anthropic)      │
│ CSS3        │          │ Port 3000    │            │ Haiku Model      │
│             │          │              │            │                  │
│ • Chat UI   │          │ • REST API   │            │ • NLP Analysis   │
│ • Buttons   │          │ • Routing    │            │ • Insights       │
│ • Display   │          │ • Auth       │            │ • Generation     │
└─────────────┘          └──────────────┘            └──────────────────┘
      ↕                         ↕                              ↕
┌─────────────┐          ┌──────────────┐            ┌──────────────────┐
│ script.js   │          │ server.js    │            │ ai-service.js    │
│ 4746 lines  │          │ 1358 lines   │            │ • Prompts        │
│             │          │              │            │ • Token mgmt     │
│ • Logic     │          │ • Endpoints  │            │ • Error handle   │
│ • Routing   │          │ • Processing │            └──────────────────┘
│ • Videos🎥  │          │ • Filter     │
└─────────────┘          └──────────────┘

 DATA STORAGE                INTEGRATIONS              INFRASTRUCTURE
┌─────────────┐          ┌──────────────┐            ┌──────────────────┐
│ Excel       │          │ Confluence   │            │ Ngrok            │
│ (.xlsx)     │          │ REST API     │            │ (Public tunnel)  │
│             │          │              │            │                  │
│ • 1575 rows │          │ • FAQs       │            │ https://...      │
│ • Cases     │          │ • Videos     │            │ ngrok-free.dev   │
│ • History   │          │ • Docs       │            └──────────────────┘
└─────────────┘          └──────────────┘                     ↕
      ↕                         ↕                    ┌──────────────────┐
┌─────────────┐          ┌──────────────┐            │ Local Server     │
│ xlsx lib    │          │ JIRA API     │            │ localhost:3000   │
│ • Parse     │          │              │            │                  │
│ • Convert   │          │ • Tickets    │            │ • Express        │
│ • Filter    │          │ • Projects   │            │ • Node.js        │
└─────────────┘          └──────────────┘            └──────────────────┘
```

---

## 🔄 DATA FLOW - KNOWLEDGE QUERY (WITHOUT AI)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                         │
│                        "¿Cómo crear un medidor en C2M?"                                 │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                          ↓
                          ┌───────────────────────────┐
                          │  FRONTEND DETECTION       │
                          │  • Keyword: "cómo"        │
                          │  • Type: KNOWLEDGE        │
                          │  • Route: searchInFAQs()  │
                          └───────────────────────────┘
                                          ↓
                    ┌─────────────────────────────────────┐
                    │    BACKEND PROCESSING               │
                    │    /api/confluence/faq-search       │
                    └─────────────────────────────────────┘
                              ↓           ↓
                 ┌────────────────┐   ┌─────────────────┐
                 │  CONFLUENCE    │   │  EXCEL          │
                 │  • Parse HTML  │   │  • Read .xlsx   │
                 │  • Extract Q&A │   │  • Filter       │
                 └────────────────┘   └─────────────────┘
                              ↓           ↓
                    ┌─────────────────────────────────────┐
                    │   MERGE RESULTS                     │
                    │   • Sort by relevance               │
                    │   • Top 5 matches                   │
                    └─────────────────────────────────────┘
                                          ↓
                          ┌───────────────────────────┐
                          │  DETECT VIDEO             │
                          │  • regex: \.mp4|\.webm    │
                          │  • Extract filename       │
                          │  • Build URL:             │
                          │    /download/attachments/ │
                          │    {pageId}/{file}        │
                          └───────────────────────────┘
                                          ↓
                    ┌─────────────────────────────────────┐
                    │   FRONTEND DISPLAY                  │
                    │   ✅ Direct answer                  │
                    │   🎥 Video link (clickable)         │
                    │   ❌ NO AI processing               │
                    │   ⚡ Time: < 1 second               │
                    └─────────────────────────────────────┘
```

---

## 📊 DATA FLOW - ANALYSIS QUERY (WITH AI)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                         │
│              "¿Cuántos casos fueron cerrados en octubre de 2025?"                       │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                          ↓
                          ┌───────────────────────────┐
                          │  FRONTEND DETECTION       │
                          │  • Keyword: "cuántos"     │
                          │  • Type: ANALYSIS         │
                          │  • Route: analyzeData()   │
                          └───────────────────────────┘
                                          ↓
                    ┌─────────────────────────────────────┐
                    │    BACKEND PROCESSING               │
                    │    /api/ai/analyze-data             │
                    └─────────────────────────────────────┘
                                          ↓
                          ┌───────────────────────────┐
                          │  READ EXCEL               │
                          │  • Load all data          │
                          │  • 1575 records           │
                          └───────────────────────────┘
                                          ↓
                    ┌─────────────────────────────────────┐
                    │   🔍 PRE-FILTER                     │
                    │   • Detect: mes=10, año=2025        │
                    │   • Filter by date column           │
                    │   • Result: 512 / 1575 records      │
                    └─────────────────────────────────────┘
                                          ↓
                          ┌───────────────────────────┐
                          │  CHECK SIZE               │
                          │  512 > 100? YES           │
                          └───────────────────────────┘
                                          ↓
                    ┌─────────────────────────────────────┐
                    │   📊 AGGREGATE                      │
                    │   • Total: 512                      │
                    │   • By specialist: {...}            │
                    │   • By status: {...}                │
                    │   • Top subjects: {...}             │
                    │   • Token estimate: ~5,000          │
                    └─────────────────────────────────────┘
                                          ↓
                    ┌─────────────────────────────────────┐
                    │   🤖 CLAUDE AI                      │
                    │   • Model: claude-3-haiku-20240307  │
                    │   • Input: Aggregated summary       │
                    │   • Prompt: "filtered-summary"      │
                    │   • Max words: 150                  │
                    │   • Instructions:                   │
                    │     "Data already filtered"         │
                    │     "Show count + summary"          │
                    │     "DON'T list all cases"          │
                    └─────────────────────────────────────┘
                                          ↓
                          ┌───────────────────────────┐
                          │  AI GENERATES             │
                          │  • Statistics             │
                          │  • Insights               │
                          │  • Trends                 │
                          │  • Comparisons            │
                          └───────────────────────────┘
                                          ↓
                    ┌─────────────────────────────────────┐
                    │   FRONTEND DISPLAY                  │
                    │   ✅ AI analysis                    │
                    │   📊 Statistics                     │
                    │   💡 Insights                       │
                    │   ⏱️ Time: 3-5 seconds              │
                    └─────────────────────────────────────┘
```

---

## 🧠 DECISION TREE - AI vs DIRECT

```
                            ┌─────────────────────┐
                            │  USER QUERY         │
                            └──────────┬──────────┘
                                       │
                         ┌─────────────▼────────────┐
                         │   ANALYZE KEYWORDS       │
                         │   • cómo, crear, error   │
                         │   • cuántos, top, stats  │
                         └─────────────┬────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                     │
            ┌───────▼────────┐                  ┌─────────▼────────┐
            │  KNOWLEDGE     │                  │  ANALYSIS        │
            │  QUESTION      │                  │  QUESTION        │
            └───────┬────────┘                  └─────────┬────────┘
                    │                                     │
        ┌───────────▼───────────┐               ┌────────▼─────────┐
        │  DIRECT SEARCH        │               │  LOAD DATA       │
        │  • Confluence         │               │  • Excel         │
        │  • Excel              │               └────────┬─────────┘
        └───────────┬───────────┘                        │
                    │                           ┌────────▼─────────┐
        ┌───────────▼───────────┐               │  PRE-FILTER      │
        │  EXTRACT RESULTS      │               │  • By date       │
        │  • Q&A                │               │  • By criteria   │
        │  • Solutions          │               └────────┬─────────┘
        └───────────┬───────────┘                        │
                    │                           ┌────────▼─────────┐
        ┌───────────▼───────────┐               │  SIZE > 100?     │
        │  DETECT VIDEO?        │               └────────┬─────────┘
        └───────────┬───────────┘                    YES │   NO
                 YES│   NO                               │    │
        ┌───────────▼──────┐                    ┌────────▼────┴────┐
        │  MAKE CLICKABLE  │                    │  AGGREGATE        │
        │  🎥 Video link   │                    │  • Summary        │
        └───────────┬──────┘                    │  • Counts         │
                    │                           └────────┬──────────┘
        ┌───────────▼───────────┐                        │
        │  DISPLAY              │               ┌────────▼─────────┐
        │  ✅ Direct answer     │               │  🤖 CLAUDE AI    │
        │  🎥 Video (if any)    │               │  • Analyze       │
        │  ❌ NO AI             │               │  • Generate      │
        │  ⚡ < 1 sec           │               └────────┬─────────┘
        └───────────────────────┘                        │
                                               ┌────────▼─────────┐
                                               │  DISPLAY         │
                                               │  ✅ AI analysis  │
                                               │  📊 Stats        │
                                               │  💡 Insights     │
                                               │  ⏱️ 3-5 sec      │
                                               └──────────────────┘
```

---

## 📦 COMPONENT BREAKDOWN

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                                     │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │  index.html │  │  style.css  │  │ script.js   │  │   Assets    │   │
│  │             │  │             │  │  4746 lines │  │   • Logo    │   │
│  │  • Chat UI  │  │  • Theme    │  │             │  │   • Icons   │   │
│  │  • Buttons  │  │  • Red Clay │  │  • Router   │  │             │   │
│  │  • Forms    │  │  • #8B0000  │  │  • Logic    │  │             │   │
│  └─────────────┘  └─────────────┘  │  • Video🎥  │  └─────────────┘   │
│                                     └─────────────┘                      │
└───────────────────────────────────────────────────────────────────────────┘
                                      ↕
┌───────────────────────────────────────────────────────────────────────────┐
│                      BACKEND LAYER                                        │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │   server.js      │  │  ai-service.js   │  │  learning-*.js   │      │
│  │   1358 lines     │  │                  │  │                  │      │
│  │                  │  │  • Client        │  │  • Disabled      │      │
│  │  • Express       │  │  • Prompts       │  │  • For future   │      │
│  │  • REST API      │  │  • Tokens        │  │                  │      │
│  │  • Pre-filter    │  │  • Error mgmt    │  │                  │      │
│  │  • Aggregate     │  └──────────────────┘  └──────────────────┘      │
│  │  • Date convert  │                                                   │
│  └──────────────────┘                                                   │
│                                                                           │
│  ENDPOINTS:                                                               │
│  • POST /api/ai/analyze-data        → AI analysis                       │
│  • GET  /api/confluence/faq-search  → Direct search                     │
│  • POST /api/jira/create-ticket     → Create ticket                     │
│  • GET  /api/data/analyze           → Read Excel                        │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
                                      ↕
┌───────────────────────────────────────────────────────────────────────────┐
│                      DATA & SERVICES LAYER                                │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Confluence  │  │    Excel     │  │     JIRA     │  │  Claude AI │ │
│  │              │  │              │  │              │  │            │ │
│  │  • FAQs      │  │  • 1575 rows │  │  • Tickets   │  │  • Haiku   │ │
│  │  • Videos    │  │  • History   │  │  • Projects  │  │  • $0.80/M │ │
│  │  • Docs      │  │  • 2024-2025 │  │  • Fields    │  │  • 50K/min │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ PERFORMANCE METRICS

```
┌────────────────────────────────────────────────────────────────┐
│              KNOWLEDGE QUERY (NO AI)                           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Query: "¿Cómo crear un medidor en C2M?"                       │
│                                                                │
│  Timeline:                                                     │
│  ├─ 0ms      User types query                                 │
│  ├─ 10ms     Detect type: KNOWLEDGE                           │
│  ├─ 310ms    Search Confluence                                │
│  ├─ 510ms    Search Excel                                     │
│  ├─ 520ms    Detect video in response                         │
│  ├─ 540ms    Create clickable link                            │
│  └─ 610ms    Display answer + video 🎥                        │
│                                                                │
│  Result:                                                       │
│  • Total time: ~610ms (< 1 second)                            │
│  • AI tokens: 0                                               │
│  • Cost: $0.00                                                │
│  • User experience: ⚡ INSTANT                                │
│                                                                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│              ANALYSIS QUERY (WITH AI)                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Query: "¿Cuántos casos en octubre 2025?"                      │
│                                                                │
│  Timeline:                                                     │
│  ├─ 0ms      User types query                                 │
│  ├─ 10ms     Detect type: ANALYSIS                            │
│  ├─ 510ms    Read Excel (1575 rows)                           │
│  ├─ 710ms    Pre-filter: 512 records                          │
│  ├─ 810ms    Aggregate summary                                │
│  ├─ 3800ms   Claude AI processing                             │
│  └─ 4100ms   Display analysis + stats                         │
│                                                                │
│  Result:                                                       │
│  • Total time: ~4.1s (3-5 seconds)                            │
│  • AI tokens: ~5,000                                          │
│  • Cost: ~$0.004                                              │
│  • User experience: 🤖 INTELLIGENT                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│              COMPARISON                                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────┬───────────────┬──────────────┐            │
│  │ Metric         │ Knowledge     │ Analysis     │            │
│  ├────────────────┼───────────────┼──────────────┤            │
│  │ Time           │ < 1 sec       │ 3-5 sec      │            │
│  │ AI Used        │ ❌ No         │ ✅ Yes       │            │
│  │ Tokens         │ 0             │ ~5,000       │            │
│  │ Cost           │ $0.00         │ $0.004       │            │
│  │ Accuracy       │ 100% (exact)  │ 95% (AI)     │            │
│  │ Video support  │ ✅ Yes        │ ❌ No        │            │
│  │ Statistics     │ ❌ No         │ ✅ Yes       │            │
│  └────────────────┴───────────────┴──────────────┘            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔐 SECURITY & AUTH FLOW

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION                               │
└─────────────────────────────────────────────────────────────────┘

    USER
     │
     │ 1. Access chatbot
     ↓
┌─────────────┐
│   NGROK     │ https://xxx.ngrok-free.dev
│   (Tunnel)  │
└─────┬───────┘
      │ 2. Forward to localhost
      ↓
┌─────────────┐
│  EXPRESS    │ Port 3000
│   SERVER    │
└─────┬───────┘
      │ 3. Route request
      ↓
┌─────────────────────────────────────┐
│  ENDPOINT AUTHENTICATION            │
├─────────────────────────────────────┤
│                                     │
│  Confluence:                        │
│  └─ Basic Auth (Base64)             │
│     Authorization: Basic {token}    │
│                                     │
│  JIRA:                              │
│  └─ Basic Auth (Base64)             │
│     Authorization: Basic {token}    │
│                                     │
│  Claude AI:                         │
│  └─ API Key (Bearer)                │
│     x-api-key: sk-ant-api03-...     │
│                                     │
└─────────────────────────────────────┘
      │ 4. Process with auth
      ↓
┌─────────────┐
│  EXTERNAL   │
│  SERVICES   │
└─────────────┘
```

---

## 📈 TOKEN OPTIMIZATION STRATEGY

```
┌──────────────────────────────────────────────────────────────────────┐
│              BEFORE OPTIMIZATION (Failed ❌)                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Query: "¿Cuántos casos en octubre 2025?"                            │
│                                                                      │
│  Excel (1575 rows)                                                   │
│       ↓                                                              │
│  Send ALL to Claude AI                                               │
│       ↓                                                              │
│  1575 rows × ~30 tokens = ~47,000 tokens                            │
│       ↓                                                              │
│  ❌ ERROR 429: Rate Limit Exceeded                                  │
│     (Limit: 50,000 tokens/min)                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│              AFTER OPTIMIZATION (Success ✅)                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Query: "¿Cuántos casos en octubre 2025?"                            │
│                                                                      │
│  Excel (1575 rows)                                                   │
│       ↓                                                              │
│  🔍 PRE-FILTER in Backend                                           │
│     • Detect: mes=10, año=2025                                      │
│     • Filter: 512 rows match                                        │
│       ↓                                                              │
│  📊 AGGREGATE (>100 records)                                        │
│     • Total: 512                                                    │
│     • By specialist: {...}                                          │
│     • By status: {...}                                              │
│     • Summary: ~5,000 tokens                                        │
│       ↓                                                              │
│  Send SUMMARY to Claude AI                                           │
│       ↓                                                              │
│  ~5,000 tokens (10x reduction!)                                     │
│       ↓                                                              │
│  ✅ SUCCESS: Analysis generated                                     │
│     Time: 3-5 seconds                                               │
│     Cost: $0.004                                                    │
│                                                                      │
│  OPTIMIZATION RESULTS:                                               │
│  • Tokens: 47,000 → 5,000 (-89%)                                   │
│  • Rate limit: Safe (10% of limit)                                  │
│  • Speed: Faster (less data to process)                            │
│  • Cost: Lower ($0.038 → $0.004)                                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 USER EXPERIENCE FLOW

```
┌─────────────────────────────────────────────────────────────────────┐
│                     USER JOURNEY                                    │
└─────────────────────────────────────────────────────────────────────┘

START
  │
  ├─▶ User opens chatbot
  │   └─▶ Welcome message displayed
  │       └─▶ Options shown:
  │           • 🔍 Asesoría (Knowledge)
  │           • 📋 Reportar Incidencia
  │           • 📊 Análisis de Datos
  │
  ├─▶ User selects or types query
  │
  ├─▶ SCENARIO A: Knowledge Question
  │   │
  │   ├─▶ "¿Cómo crear un medidor?"
  │   │
  │   ├─▶ System searches (< 1 sec)
  │   │
  │   ├─▶ Results displayed:
  │   │   ┌──────────────────────────┐
  │   │   │ 📚 FAQ from Confluence   │
  │   │   │                          │
  │   │   │ ❓ Pregunta:             │
  │   │   │ "¿Cómo crear medidor?"   │
  │   │   │                          │
  │   │   │ 📱 Aplicación: C2M       │
  │   │   │                          │
  │   │   │ ✅ Respuesta:            │
  │   │   │ "Ver procedimiento en:"  │
  │   │   │ 🎥 video.mp4 (clickable) │
  │   │   │                          │
  │   │   │ 🔗 Ver en Confluence     │
  │   │   └──────────────────────────┘
  │   │
  │   ├─▶ User clicks video 🎥
  │   │   └─▶ Opens Confluence video
  │   │
  │   └─▶ Feedback options:
  │       • ✅ Sí, resuelto
  │       • 📋 Crear ticket
  │       • ❌ Finalizar
  │
  ├─▶ SCENARIO B: Analysis Question
  │   │
  │   ├─▶ "¿Cuántos casos octubre 2025?"
  │   │
  │   ├─▶ System shows loading (3-5 sec):
  │   │   "🤖 AI-Assisted Support Agent
  │   │    está analizando..."
  │   │
  │   ├─▶ Analysis displayed:
  │   │   ┌──────────────────────────┐
  │   │   │ 🤖 Análisis IA           │
  │   │   │                          │
  │   │   │ 📊 OCTUBRE 2025:         │
  │   │   │                          │
  │   │   │ Total casos: 512         │
  │   │   │                          │
  │   │   │ 👥 Por especialista:     │
  │   │   │ • Juan: 47 casos         │
  │   │   │ • María: 42 casos        │
  │   │   │                          │
  │   │   │ 📈 Por estado:           │
  │   │   │ • Cerrado: 487           │
  │   │   │ • Abierto: 25            │
  │   │   │                          │
  │   │   │ 💡 Insights:             │
  │   │   │ "Octubre mostró +14.5%   │
  │   │   │  vs septiembre..."       │
  │   │   └──────────────────────────┘
  │   │
  │   └─▶ Options:
  │       • 📋 Ver detalles
  │       • 🔄 Otra consulta
  │       • ✅ Finalizar
  │
  └─▶ END
```

---

**Creado por:** Red Clay Consulting, Inc.  
**Para:** Celsia  
**Fecha:** Febrero 2026  
**Tecnología:** Claude AI (Anthropic) + Node.js + Express
