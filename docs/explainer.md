# Your Digital Brain — A Beginner's Complete Guide

> **Who this is for:** You built this project with AI assistance and want to truly understand
> what every piece does, why it exists, and how it all fits together. No prior technical
> knowledge is assumed. Every term is defined when it first appears.

---

## Table of Contents

1. [What Is a Digital Brain?](#1-what-is-a-digital-brain)
2. [The Big Picture — How Everything Connects](#2-the-big-picture--how-everything-connects)
3. [What Is MCP? (Model Context Protocol)](#3-what-is-mcp-model-context-protocol)
4. [What Are Embeddings? (The Core Magic)](#4-what-are-embeddings-the-core-magic)
5. [What Is Supabase?](#5-what-is-supabase)
6. [What Is Vercel?](#6-what-is-vercel)
7. [How Data Flows — Step by Step](#7-how-data-flows--step-by-step)
8. [The 9 Tools Your Brain Has](#8-the-9-tools-your-brain-has)
9. [Security — How Your Data Is Protected](#9-security--how-your-data-is-protected)
10. [The Multimodal Magic — Cross-Modal Search](#10-the-multimodal-magic--cross-modal-search)
11. [What Each File in the Project Does](#11-what-each-file-in-the-project-does)
12. [Glossary](#12-glossary)

---

## 1. What Is a Digital Brain?

### The Problem It Solves

Every time you start a new conversation with an AI assistant — whether that's Claude,
ChatGPT, Cursor, or any other — the AI starts completely fresh. It has no idea who you are,
what projects you're working on, what decisions you've made, or what you told it last week.

It's like hiring a brilliant assistant who develops amnesia every single morning.

> **Think of it like this:**
> Imagine you have a phenomenal personal assistant. Super smart, incredibly helpful.
> But every morning when they arrive at work, they remember absolutely nothing from
> the day before. You have to re-explain your entire project, your preferences,
> your history, everything — every single day. Exhausting, right?

Your Digital Brain solves this problem. It's a personal knowledge base — a structured
collection of your notes, files, decisions, and context — that your AI assistants can
**read from and write to**. Instead of re-explaining everything each time, your AI
assistant can look things up, store new information, and build real continuity over time.

### What Gets Stored

Your Digital Brain can hold:

- **Text memories** — notes, decisions, facts, project context, anything you want remembered
- **Images** — screenshots, diagrams, photos
- **PDFs** — documents, reports, reference materials
- **Audio files** — recordings, voice memos
- **Video files** — tutorials, demos, anything visual

And the magic is that **all of it is searchable together** — more on how that works in
[Section 4](#4-what-are-embeddings-the-core-magic).

### The Shared Notebook Analogy

```
┌─────────────────────────────────────────────────────┐
│              YOUR DIGITAL BRAIN                     │
│                                                     │
│  📝 "EBR API uses OAuth 2.0"                        │
│  📝 "Client prefers dark mode in all dashboards"    │
│  🖼️  architecture-diagram.png                       │
│  📄  project-requirements.pdf                       │
│  📝 "Deploy to Azure every Friday at 5pm"           │
│  🎵  meeting-recording-jan-15.mp3                   │
│  📝 "The database schema has 3 tables..."           │
│                                                     │
│       ↑ readable by ANY AI assistant                │
│       ↑ writable by ANY AI assistant                │
│       ↑ searchable by meaning, not just keywords    │
└─────────────────────────────────────────────────────┘
```

Any AI tool you connect — Claude Desktop, Cursor, GitHub Copilot, a custom chatbot —
all share the same brain. They all read from and write to the same place. Information
stored by one assistant is immediately available to all others.

---

## 2. The Big Picture — How Everything Connects

Let's zoom out and look at the whole system at once, then we'll explain each piece.

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        THE COMPLETE SYSTEM                              ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   ┌────────────────┐                                                     ║
║   │   YOU (human)  │  ← types messages, uploads files                   ║
║   └───────┬────────┘                                                     ║
║           │  you speak natural English                                   ║
║           ▼                                                              ║
║   ┌────────────────────────────────────────────┐                        ║
║   │         AI ASSISTANT                       │                        ║
║   │   (Claude Desktop, Cursor, Copilot, etc.)  │                        ║
║   │                                            │                        ║
║   │  "I need to store/retrieve something.      │                        ║
║   │   Let me use the Digital Brain tools."     │                        ║
║   └───────────────────┬────────────────────────┘                        ║
║                       │  speaks MCP protocol                            ║
║                       │  (a universal AI language)                      ║
║                       ▼                                                  ║
║   ┌────────────────────────────────────────────┐                        ║
║   │         YOUR MCP SERVER                    │                        ║
║   │    (hosted on Vercel, always online)       │                        ║
║   │                                            │                        ║
║   │  Receives tool requests, checks security,  │                        ║
║   │  orchestrates storage and retrieval        │                        ║
║   └──────┬──────────────────────┬──────────────┘                        ║
║          │                      │                                        ║
║          │ "convert this        │ "store/retrieve this data"             ║
║          │  to a vector"        │                                        ║
║          ▼                      ▼                                        ║
║   ┌─────────────┐    ┌──────────────────────────┐                       ║
║   │   GEMINI    │    │         SUPABASE          │                       ║
║   │ EMBEDDING 2 │    │                           │                       ║
║   │  (Google)   │    │  ┌─────────────────────┐  │                       ║
║   │             │    │  │  PostgreSQL Database │  │                       ║
║   │  Reads text │    │  │  (memories + vectors)│  │                       ║
║   │  images,    │    │  └─────────────────────┘  │                       ║
║   │  audio,     │    │  ┌─────────────────────┐  │                       ║
║   │  video,     │    │  │    File Storage      │  │                       ║
║   │  PDFs       │    │  │  (images, PDFs, etc) │  │                       ║
║   │             │    │  └─────────────────────┘  │                       ║
║   │  Outputs:   │    │                           │                       ║
║   │  768 numbers│    │  Also uses Redis (Upstash)│                       ║
║   │  per item   │    │  for connection management│                       ║
║   └─────────────┘    └──────────────────────────┘                       ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### Explaining Each Arrow

**You → AI Assistant**

You just talk normally. "Remember that the client wants weekly reports." or
"What do I know about the EBR project?" The AI understands plain English and
decides when to use the Digital Brain tools.

**AI Assistant → MCP Server**

The AI assistant talks to your MCP server using a special standardized language
called MCP (Model Context Protocol). Think of this as a common electrical outlet
standard — your AI knows how to "plug in" to any MCP-compatible tool.

**MCP Server → Gemini**

When you store or search something, your server sends the content to Google's
Gemini Embedding model. Gemini reads it (whether it's text, an image, a PDF,
or audio) and converts it into a list of 768 numbers. These numbers capture the
*meaning* of the content. This is how searching by meaning becomes possible.

**MCP Server → Supabase**

After getting the numbers from Gemini, your server stores everything in Supabase:
- The original text or file goes into storage
- The 768 numbers (the "meaning fingerprint") go into the database alongside it

When searching, Supabase compares the search query's numbers against all stored
items' numbers, and returns the closest matches.

---

## 3. What Is MCP? (Model Context Protocol)

### The USB Analogy

Before USB existed, every device had its own unique connector. Your printer used
one kind of cable, your mouse used another, your keyboard yet another. If you
switched computers, nothing was compatible. Then USB came along and said:
"Everyone use this one standard connector." Now any USB device works with any
computer.

MCP does the same thing for AI tools.

> **Think of it like this:**
> Before MCP, if you wanted to give Claude access to a tool, you'd build it
> specifically for Claude. Then if you wanted Cursor to use the same tool,
> you'd have to rebuild it specifically for Cursor. And again for every new
> AI assistant. Exhausting and wasteful.
>
> With MCP, you build a tool *once*, following the MCP standard, and every
> AI assistant that supports MCP can use it immediately. One server, every client.

### Before and After MCP

```
BEFORE MCP:
──────────
                    ┌─────────────────────┐
  Claude ──────────►│ Claude-specific code │
                    └─────────────────────┘
                    
                    ┌──────────────────────┐
  Cursor ──────────►│ Cursor-specific code │
                    └──────────────────────┘
                    
                    ┌───────────────────────────┐
  GitHub Copilot ──►│ Copilot-specific code     │
                    └───────────────────────────┘
  
  (same features, rebuilt 3 times)


WITH MCP:
─────────
  Claude ─────────┐
                  │
  Cursor ─────────┼──────► Your MCP Server ──► Supabase
                  │         (one codebase)      Gemini, etc.
  GitHub Copilot ─┘
  OpenCode ───────┘
  Any future AI ──┘
  
  (one codebase, works for everyone)
```

### What an MCP Server Is

An MCP server is just a program — code running on a computer (in your case, on
Vercel's servers) — that exposes a list of **tools** that AI assistants can call.

The server speaks a specific language (the MCP protocol) that all compatible AI
assistants understand. When an AI assistant connects to your server, it first asks:
"What tools do you have?" Your server responds with a list of 9 tools and a
description of what each one does. The AI then decides when to call each tool
based on what you ask for.

### What "Tools" Are

In MCP, a "tool" is a specific action that an AI assistant can trigger. Think of
tools like buttons the AI can press — each button does something specific.

Your Digital Brain has 9 tools (buttons):
- One to save a text note
- One to save a file
- One to search everything
- One to list what's stored
- ... and more (covered in [Section 8](#8-the-9-tools-your-brain-has))

When you say "remember this," the AI assistant presses the `store_memory` button.
When you say "what do I know about X?", the AI presses the `search_memory` button.

### What SSE Is (How the AI Connects)

**SSE** stands for **Server-Sent Events**. It's a type of internet connection where
the server can push updates to the client (the AI assistant) in real time, rather
than the client having to keep asking "are you done yet?"

> **Think of it like this:**
> Imagine ordering a pizza. You could call the pizza place every 5 minutes and ask
> "is my pizza ready?" (that's called "polling"). Or they could just call you when
> it's ready (that's SSE). SSE is more efficient — the server talks to you when
> it has something to say.

Your MCP server uses SSE to maintain a live connection with the AI assistant during
a conversation, which also uses Redis (a fast temporary storage) to manage these
active connections.

---

## 4. What Are Embeddings? (The Core Magic)

This is the most important concept in your entire Digital Brain. Everything else
is just plumbing. Embeddings are *why* the system is magical.

### The Problem: Computers Don't Understand Meaning

Traditional search (like Ctrl+F) looks for exact words. If you stored a note saying
"OAuth 2.0 is used for authentication," and later searched for "login security,"
traditional search would find nothing — because those exact words don't appear.

But *you* know those phrases mean related things. How do we teach a computer to
understand that "OAuth 2.0" relates to "login security"?

The answer: **embeddings**.

### The GPS Coordinates Analogy

Imagine you could convert every idea into a location on a map. Similar ideas get
placed near each other. Very different ideas get placed far apart.

```
                    IDEA MAP (simplified to 2D)
                    
  Security ●───────────────────────────────────── Technology
     ▲                                                  ▲
     │   "OAuth 2.0"  ●    ● "login security"           │
     │                                                   │
     │          ● "password protection"                  │
     │                                                   │
     │                                                   │
     │                                                   │
     │   ● "chocolate cake recipe"                       │
     │                         ● "baking tips"           │
     │                                                   │
  Personal ◄────────────────────────────────────── Food
```

In this example, "OAuth 2.0" and "login security" would be *near* each other on
the map, because they're related concepts. "Chocolate cake recipe" would be
*far away* from "login security."

**Searching for meaning = "show me everything near this location on the map."**

That's exactly what your Digital Brain does. When you search for "login security,"
it converts that phrase into coordinates, then finds everything stored near
those coordinates — and "OAuth 2.0" would be one of the closest results, even
though the words are completely different.

### What a Vector Actually Is

The word **vector** just means "a list of numbers." That's it.

A GPS location is a vector with 2 numbers (latitude, longitude):
```
New York City = [40.7128, -74.0060]
Los Angeles   = [34.0522, -118.2437]
```

Your Digital Brain uses vectors with **768 numbers** instead of 2.
Each of the 768 numbers captures one aspect of meaning. You can think of each
number as the answer to a different "meaning question":

```
Number 1:   How much does this relate to technology? (0.0 to 1.0)
Number 2:   How much does this relate to security? (0.0 to 1.0)
Number 3:   How formal is the language? (0.0 to 1.0)
Number 4:   How much does this relate to people? (0.0 to 1.0)
... 764 more numbers, each capturing a different nuance ...
Number 768: (some other subtle aspect of meaning)
```

In reality, these numbers don't have clean labels — the AI model learned what
aspects to capture during training on billions of documents. But the effect is
the same: similar ideas end up with similar numbers, so they're "near" each other
in 768-dimensional space.

### What an Embedding Model Does

An **embedding model** is an AI model that takes content as input and outputs
a vector. It's like a translator that converts meaning into numbers.

```
INPUT                                          OUTPUT
──────                                         ──────

"OAuth 2.0 is used for authentication"  →  [0.23, -0.45, 0.78, 0.12, ...]
                                              768 numbers total

"This system uses OAuth for login"      →  [0.22, -0.43, 0.77, 0.13, ...]
                                              (very similar numbers!)

"I like chocolate ice cream"            →  [0.89, 0.12, -0.34, 0.67, ...]
                                              (very different numbers)
```

Your system uses **Gemini Embedding 2** (also called `gemini-embedding-exp-03-07`),
which is Google's state-of-the-art embedding model.

### Why Gemini Embedding 2 Is Special

Most embedding models only work with text. Gemini Embedding 2 is **multimodal**,
meaning it understands multiple types of content and puts them all on the
**same map**:

```
                    GEMINI'S UNIFIED MEANING MAP
                    
    Text about security ●
                         ● Image of a lock icon      ← different types,
                                 ● PDF about firewalls  same neighborhood!
                         
    
    Text about cooking ●
                        ● Photo of a meal
                               ● Recipe PDF
```

This is revolutionary. It means you can search with a text query and find
images that contain related concepts. The text and the image end up near
each other on the map because they mean similar things.

### What "3072 → 768 Dimensions" Means

Gemini Embedding 2 actually outputs **3072 numbers** by default. But through a
technique called **MRL (Matryoshka Representation Learning)**, the model is
trained so that the **first 768 numbers contain the most important meaning**.

> **Think of it like this:**
> Imagine describing a person. The first things you'd say capture the most
> important features: "She's tall, has red hair, and usually wears glasses."
> That's the essential description (like the first 768 numbers). You *could*
> add more detail — her exact height, the specific shade of red, the brand of
> glasses — but you've already captured the core identity.
>
> The 768-number version is like the essential description. The full 3072
> numbers are like the exhaustive detailed description. For most searches,
> the 768-number version works just as well and is much faster to compare.

> **Why "Matryoshka"?**
> Matryoshka dolls are Russian nesting dolls — each doll contains a smaller
> doll inside it. The name was chosen because the 768-dimension version is
> "inside" the 3072-dimension version, like a smaller doll nested inside
> a larger one.

### What "Cosine Similarity" Is

Once everything is stored as vectors (lists of numbers), searching means
comparing vectors. The way vectors are compared is called **cosine similarity**.

> **Think of it like this:**
> Imagine two arrows pointing in directions on a compass. If both arrows point
> north, they're pointing in the same direction — they're similar. If one points
> north and one points south, they're opposites. Cosine similarity measures the
> *angle* between two arrows, regardless of how long they are.
>
> When the angle is 0° (pointing the same direction), cosine similarity = 1.0
> When the angle is 90° (perpendicular), cosine similarity = 0.0
> When the angle is 180° (opposite directions), cosine similarity = -1.0

```
SIMILARITY SCALE:
─────────────────

1.0  ●══════════════════════════  Identical meaning
     │
0.9  │  "login security" vs "OAuth authentication"
     │
0.7  │  "database design" vs "SQL schema"
     │
0.5  │  "Python programming" vs "software development"
     │
0.3  │  "cooking recipes" vs "chemistry formulas"
     │
0.1  │  "dog breeds" vs "spreadsheet formulas"
     │
0.0  ●══════════════════════════  Completely unrelated
```

### The Full Search Flow — Diagram

Here's how a search actually works from start to finish:

```
YOU TYPE: "What tech does EBR use?"
                    │
                    ▼
        ┌───────────────────────┐
        │   Your MCP Server     │
        │   receives the query  │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │   Gemini Embedding 2  │
        │   reads the query     │
        └───────────┬───────────┘
                    │
                    ▼
        "What tech does EBR use?"
                    │
                    ▼
        [0.12, -0.34, 0.56, 0.89, ...]   ← 768 numbers
                    │
                    ▼
        ┌─────────────────────────────────────────────────────────────┐
        │   SUPABASE COMPARISON (compares against ALL stored vectors) │
        │                                                             │
        │   Memory: "EBR system uses Azure Functions + Cosmos DB"     │
        │   Stored vector: [0.11, -0.33, 0.57, 0.88, ...]            │
        │   Similarity: ████████████████████████████░░  0.89 ← MATCH  │
        │                                                             │
        │   Memory: "Meeting notes from Jan 15 call with client"      │
        │   Stored vector: [0.45, 0.22, -0.11, 0.34, ...]            │
        │   Similarity: ████████░░░░░░░░░░░░░░░░░░░░░░  0.31         │
        │                                                             │
        │   Memory: "My grocery list for Tuesday"                     │
        │   Stored vector: [0.78, 0.89, -0.45, 0.12, ...]            │
        │   Similarity: ███░░░░░░░░░░░░░░░░░░░░░░░░░░░  0.12         │
        │                                                             │
        │   Image: architecture-diagram.png                           │
        │   Stored vector: [0.13, -0.35, 0.54, 0.90, ...]            │
        │   Similarity: █████████████████████████░░░░░  0.81 ← MATCH  │
        └─────────────────────────────────────────────────────────────┘
                    │
                    ▼
        TOP RESULTS RETURNED (sorted by similarity):
        1. "EBR system uses Azure Functions + Cosmos DB"  [0.89]
        2. architecture-diagram.png (image file)          [0.81]
        3. "Meeting notes from Jan 15..."                 [0.31]
        
                    │
                    ▼
        Claude shows you the results, including the image
```

Notice that **the image was found by a text search**. That's the multimodal magic.

---

## 5. What Is Supabase?

Supabase is where all your data actually lives. Think of it as a combination of
three things:

1. A powerful database (for storing structured data)
2. A file storage system (for storing actual files)
3. A set of security rules (for controlling access)

### PostgreSQL — The Database

At its core, Supabase runs **PostgreSQL** (usually called "Postgres"). Postgres
is a database — software designed to store, organize, and retrieve data very
efficiently and reliably.

> **Think of it like this:**
> A database is like a very sophisticated spreadsheet that can handle millions
> of rows without slowing down, that multiple people can read and write
> simultaneously, and that can find specific rows almost instantly even in
> huge datasets. Postgres has been around since 1996 and is one of the most
> trusted databases in the world.

Your database has a table called `memories` (like a spreadsheet tab) with
columns like:

```
memories table:
┌────┬──────────────────────────────┬───────────────────┬──────────────────────────────┐
│ id │ content                      │ content_type      │ embedding (768 numbers)      │
├────┼──────────────────────────────┼───────────────────┼──────────────────────────────┤
│  1 │ EBR API uses OAuth 2.0       │ text              │ [0.23, -0.45, 0.78, ...]     │
│  2 │ Client prefers dark mode     │ text              │ [0.56, 0.12, -0.34, ...]     │
│  3 │ architecture-diagram.png     │ image             │ [0.11, -0.33, 0.57, ...]     │
│  4 │ project-requirements.pdf     │ document          │ [0.89, 0.45, 0.12, ...]      │
└────┴──────────────────────────────┴───────────────────┴──────────────────────────────┘
```

### pgvector — The Vector Plugin

Standard Postgres knows how to store text, numbers, and dates. But it doesn't
natively know how to store or search *vectors* (those lists of 768 numbers).

**pgvector** is a plugin — an add-on — for Postgres that adds vector superpowers:
- It adds a new column type called `vector` (to store those 768 numbers)
- It adds a function called `cosine_similarity` (to compare vectors)
- It makes vector comparisons fast by building special indexes

> **Think of it like this:**
> Imagine a library that only knows how to organize books alphabetically.
> You add a plugin that teaches it to organize books by topic, so you can
> now say "find me all books near this topic" and get fast results.
> pgvector is that plugin, for Postgres, for meaning-based search.

### HNSW — Making Search Fast

Even with pgvector, searching through thousands of vectors by comparing each
one individually would be slow. The database uses an index called **HNSW**
(Hierarchical Navigable Small World) to make it fast.

> **Think of it like this:**
> Imagine finding a word in a dictionary. You *could* start at page 1 and read
> every word until you find it. That's slow. Instead, dictionaries have an
> alphabetical structure — you can flip to roughly the right section and
> find the word quickly. The index in the back of a textbook works similarly:
> it tells you exactly which page to go to for a topic.
>
> HNSW is the index for vector search. Instead of comparing your query
> against every single stored vector, HNSW has a clever multi-layer structure
> that lets the database jump directly to the neighborhood of similar vectors
> and check just those. Searches that might take seconds become milliseconds.

### File Storage

Supabase also includes a file storage system — similar to Google Drive or
Amazon S3 — for storing actual files (images, PDFs, audio, video).

Your Digital Brain stores files in a "bucket" (think: folder) called `brain-files`.
When you store an image, two things happen:
1. The actual image file goes into `brain-files` in Supabase Storage
2. The 768-number vector (representing the image's meaning) + metadata goes into
   the `memories` database table

These two things are linked by the same ID, so when you search and find a memory,
the system knows how to retrieve the associated file.

```
┌──────────────────────────────────────────────────────────────────┐
│  SUPABASE                                                        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Database (memories table)                              │    │
│  │                                                         │    │
│  │  id=42  content="architecture diagram"                  │    │
│  │         file_path="brain-files/uuid-42.png"  ←──────┐  │    │
│  │         embedding=[0.23, -0.45, ...]                  │  │    │
│  └─────────────────────────────────────────────────────-─┘ │    │
│                                                           │  │    │
│  ┌──────────────────────────────────────────────────┐    │  │    │
│  │  Storage (brain-files bucket)                    │    │  │    │
│  │                                                  │    │  │    │
│  │  📁 brain-files/                                 │    │  │    │
│  │      📄 uuid-42.png  ────────────────────────────┘  │    │
│  │      📄 uuid-43.pdf                                    │    │
│  │      📄 uuid-44.mp3                                    │    │
│  └──────────────────────────────────────────────────┘    │    │
│                                                              │    │
└──────────────────────────────────────────────────────────────────┘
```

### RLS — Row Level Security

**RLS** (Row Level Security) is a feature that adds an extra layer of protection
to your database. Even if someone gets access to your database URL, they still
can't read or write data without proper credentials.

> **Think of it like this:**
> Imagine a building with two security systems. First, you need a key to get
> through the front door (the database URL). But even once you're inside,
> you also need a badge to access any specific room (RLS). Someone who
> finds the front door key still can't get into any rooms.

Your database's RLS policies are set up to only allow access when using the
**Service Role Key** — a special master key that only your server knows.
More on keys in [Section 9](#9-security--how-your-data-is-protected).

### Supabase Is Hosted

You don't run Supabase on your own computer. It runs "in the cloud" — on
Supabase's servers, somewhere in a data center. This means:

- Your data is always there, even when your computer is off
- You don't need to manage server hardware
- Supabase handles backups, updates, and reliability
- You access it through the internet from your Vercel server

---

## 6. What Is Vercel?

Vercel is the service that hosts your MCP server code. It makes your
Digital Brain accessible on the internet, 24/7, without you needing to
manage your own server.

### Serverless — Paying for What You Use

Your MCP server runs as a **serverless** function on Vercel. "Serverless"
doesn't mean there's no server — it means you don't manage the server.
More importantly, your code only *runs* when someone actually calls it.

> **Think of it like this:**
> Traditional hosting is like renting a car 24/7 — you pay the same whether
> you drive it or not. Serverless is like Uber — you only pay when you're
> actually in a car. Your code starts up when a request comes in, runs,
> returns the result, and then stops. When nobody's using the Digital Brain,
> there's nothing running and nothing to pay for.

```
TRADITIONAL HOSTING:
─────────────────────
  [Server running]  [Server running]  [Server running]  ← always on, always paying
  
  
SERVERLESS:
───────────
  Request arrives →  [Server starts]  [Code runs]  [Returns result]  [Server stops]
      ↑                                                                    ↑
  you pay                                                              you stop paying
```

### Auto-Deployment from GitHub

Vercel connects to your GitHub repository (where your code is stored).
Every time you push a code change to GitHub, Vercel automatically:
1. Detects the new code
2. Builds it (turns your source files into a runnable program)
3. Deploys it (makes the new version live on the internet)

This happens in about 30–60 seconds, with zero manual steps. The old version
stays live until the new one is ready, so there's no downtime.

```
You edit code → Push to GitHub → Vercel detects change
                                         ↓
                             Vercel builds the code
                                         ↓
                             New version goes live
                                         ↓
                         Your MCP URL is updated automatically
```

### Environment Variables — Keeping Secrets Safe

Your code needs several secret keys (API keys, database passwords, etc.).
You don't put these in your code files (that would be dangerous, since
your code is on GitHub which might be public). Instead, you store them
as **environment variables** in Vercel's dashboard.

Vercel securely injects these secrets into your running code without
exposing them anywhere. They're like locked containers that your code
can open from the inside.

### Redis (Upstash) — Managing Connections

When an AI assistant connects to your MCP server, it maintains an ongoing
connection (using SSE, explained in Section 3). To manage these active
connections reliably in a serverless environment, your system uses
**Redis** (provided by a service called Upstash).

> **Think of it like this:**
> Redis is like a whiteboard in a shared office. When an AI assistant
> connects, your server writes "Claude is connected on channel #abc123"
> on the whiteboard. When a response comes back from Supabase, the server
> checks the whiteboard to know which channel to send it to. Redis is
> extremely fast (it stores everything in RAM rather than on disk), making
> it perfect for this kind of real-time coordination.

---

## 7. How Data Flows — Step by Step

Let's trace the exact journey of information through your system for three
common operations.

### Operation 1: Storing a Text Memory

You're working with Claude and want to save an important piece of information.

```
Step 1: You speak
────────────────
  You: "Remember that the EBR API uses OAuth 2.0 for authentication"
  
  
Step 2: Claude decides to act
─────────────────────────────
  Claude recognizes this as a store request and calls the
  store_memory tool on your MCP server:
  
  {
    tool: "store_memory",
    content: "The EBR API uses OAuth 2.0 for authentication",
    metadata: { tags: ["EBR", "API", "security"] }
  }
  

Step 3: Your MCP server receives the request
──────────────────────────────────────────────
  The request arrives at your Vercel-hosted server at
  your-digital-brain.vercel.app/api/mcp
  

Step 4: Security check
───────────────────────
  The server checks the request for an API key.
  (This was configured when the AI assistant connected.)
  
  API key valid? ──YES──► Continue
                 ──NO───► Return error, stop here
  

Step 5: Get the embedding
──────────────────────────
  Server sends the text to Google's Gemini API:
  
  Request to Gemini:
    text: "The EBR API uses OAuth 2.0 for authentication"
    dimensions: 768
    task_type: "SEMANTIC_SIMILARITY"
  
  Gemini responds with:
    embedding: [0.23, -0.45, 0.78, 0.12, 0.56, ... (768 numbers total)]
  

Step 6: Store in Supabase
──────────────────────────
  Server sends to Supabase database:
  
  INSERT INTO memories (
    content      = "The EBR API uses OAuth 2.0 for authentication",
    content_type = "text",
    embedding    = [0.23, -0.45, 0.78, ...],
    metadata     = {"tags": ["EBR", "API", "security"]},
    created_at   = "2026-03-21T23:38:00Z"
  )
  
  Supabase stores it and returns the new row's ID (e.g., 42)
  

Step 7: Return success
───────────────────────
  Your MCP server returns to Claude:
  { success: true, id: 42, message: "Memory stored!" }
  

Step 8: Claude confirms
────────────────────────
  Claude tells you:
  "Got it! I've stored that in your Digital Brain. (Memory #42)"
```

### Operation 2: Storing a File

You want to save an architecture diagram image.

```
Step 1: You share the file
───────────────────────────
  You: "Store this architecture diagram" [attaches architecture.png]
  

Step 2: Claude calls store_file
────────────────────────────────
  Claude converts the image to base64 (a way to represent binary
  files as text — explained in the glossary) and calls:
  
  {
    tool: "store_file",
    file_data: "iVBORw0KGgoAAAANSUhEUgAAA...",  ← base64-encoded image
    mime_type: "image/png",                       ← file type
    filename: "architecture.png",
    description: "System architecture diagram showing all components"
  }
  

Step 3: Security check
───────────────────────
  Same as before — API key is verified.
  

Step 4: Upload file to Supabase Storage
────────────────────────────────────────
  Server converts base64 back to actual image bytes
  
  Uploads to Supabase Storage:
    bucket: "brain-files"
    path: "memories/a1b2c3d4-uuid.png"
    data: [actual image bytes]
  
  Supabase stores the file and returns the storage path.
  

Step 5: Create the embedding
─────────────────────────────
  The system creates what's called an "interleaved" embedding.
  Since you provided BOTH an image AND a description, it sends both:
  
  Request to Gemini:
    parts: [
      { text: "System architecture diagram showing all components" },
      { image: [image bytes] }
    ]
    dimensions: 768
  
  Gemini reads BOTH the description text AND the actual image pixels,
  and returns a SINGLE vector that captures BOTH meanings combined.
  
  This is more powerful than embedding either one alone — the resulting
  vector captures both what the image looks like AND what it means.
  

Step 6: Store metadata in database
────────────────────────────────────
  INSERT INTO memories (
    content      = "System architecture diagram showing all components",
    content_type = "image",
    file_path    = "memories/a1b2c3d4-uuid.png",
    mime_type    = "image/png",
    embedding    = [0.11, -0.33, 0.57, ...],   ← combined image+text vector
    metadata     = { "original_filename": "architecture.png" }
  )
  

Step 7: Confirm to Claude, Claude confirms to you
──────────────────────────────────────────────────
  "Image stored in your Digital Brain! I've saved the architecture
  diagram along with the description."
```

### Operation 3: Searching Your Brain

You want to find what you know about a topic.

```
Step 1: You ask
────────────────
  You: "What do I know about system architecture?"
  

Step 2: Claude calls search_memory
────────────────────────────────────
  {
    tool: "search_memory",
    query: "system architecture",
    limit: 5,         ← return top 5 matches
    threshold: 0.3    ← only return if similarity > 30%
  }
  

Step 3: Get query embedding
────────────────────────────
  Server sends "system architecture" to Gemini
  
  Gemini returns: [0.45, -0.22, 0.67, ...]  ← 768 numbers for the query
  

Step 4: Vector search in Supabase
──────────────────────────────────
  Server calls a database function called match_memories:
  
  SELECT * FROM memories
  ORDER BY embedding <=> query_vector    ← "<=>" means "distance between"
  WHERE similarity > 0.3
  LIMIT 5;
  
  Supabase uses the HNSW index to do this blazingly fast.
  It checks the query vector [0.45, -0.22, 0.67, ...] against ALL
  stored vectors simultaneously and returns the 5 closest.
  

Step 5: Generate signed URLs for files
────────────────────────────────────────
  For any results that are files (images, PDFs, etc.),
  the server generates a temporary signed URL — a special web link
  that works for 1 hour, allowing the file to be downloaded.
  
  "brain-files/memories/a1b2c3d4.png"
       ↓
  "https://supabase.../storage/v1/object/sign/...?token=xyz&expires=3600"
  

Step 6: Return results to Claude
─────────────────────────────────
  [
    {
      content: "System architecture diagram",
      content_type: "image",
      similarity: 0.87,
      file_url: "https://...signed-url..."
    },
    {
      content: "EBR uses Azure Functions and Cosmos DB",
      content_type: "text",
      similarity: 0.79
    },
    {
      content: "Deploy infrastructure notes from March",
      content_type: "text",
      similarity: 0.61
    }
  ]
  

Step 7: Claude shows you the results
──────────────────────────────────────
  Claude presents the results, including the image if found,
  and summarizes what you know about system architecture.
```

---

## 8. The 9 Tools Your Brain Has

Your MCP server exposes exactly 9 tools to AI assistants. Here's what each one does.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    THE 9 DIGITAL BRAIN TOOLS                            │
├─────────────────────────┬────────────────────────────────────────────────┤
│  Tool Name              │  What It Does                                  │
├─────────────────────────┼────────────────────────────────────────────────┤
│  1. store_memory        │  Save a text note                              │
│  2. store_file          │  Upload and save a file (with data)            │
│  3. store_file_from_url │  Save a file from a web link                   │
│  4. search_memory       │  Find things by meaning (all types)            │
│  5. get_file_url        │  Get a download link for a stored file         │
│  6. list_memories       │  Browse everything you've stored               │
│  7. update_memory       │  Change an existing memory                     │
│  8. delete_memory       │  Remove a memory (and its file)                │
│  9. get_stats           │  See how much is in your brain                 │
└─────────────────────────┴────────────────────────────────────────────────┘
```

### Tool 1: store_memory

**What it does:** Saves a text note to your brain.

**Inputs:**
- `content` — The text to remember (required)
- `metadata` — Optional extra info, like tags or a source URL

**Example use:**
> "Remember that the client's database password policy requires rotation every 90 days."

**What happens internally:** Sends text to Gemini → gets 768-number vector →
stores text + vector in the memories table.

---

### Tool 2: store_file

**What it does:** Uploads a file (image, PDF, audio, video) and saves it with
an optional text description. The file data is sent as base64 (text encoding
of binary data).

**Inputs:**
- `file_data` — The file's content in base64 format (required)
- `mime_type` — The file type, like "image/png" or "application/pdf" (required)
- `filename` — A name for the file (required)
- `description` — Optional text description (recommended — makes searching better)

**Example use:**
> "Store this screenshot" [attaches screenshot.png]

**What's special:** If you provide both a file AND a description, Gemini creates
a combined "interleaved" embedding that captures both. This makes the stored item
searchable by its visual content *and* your textual description.

---

### Tool 3: store_file_from_url

**What it does:** Downloads a file from a web address and stores it in your brain.
Useful when you find something online you want to save.

**Inputs:**
- `url` — The web address of the file (required)
- `description` — Optional text description
- `filename` — Optional name (defaults to the URL's filename)

**Example use:**
> "Save this architecture diagram from https://docs.example.com/arch.png"

**What happens internally:** Server downloads the file from the URL → same flow
as `store_file` from there.

---

### Tool 4: search_memory

**What it does:** Finds memories by meaning. This is the core retrieval tool —
searches across all memory types (text, images, PDFs, audio, everything).

**Inputs:**
- `query` — What you're looking for in plain English (required)
- `limit` — How many results to return (default: 5, max: 20)
- `threshold` — Minimum similarity score (default: 0.0 = return everything)
- `content_type` — Optional filter: only return "text", "image", "document", etc.

**Example use:**
> "What do I know about authentication methods?"
> "Find any images of architecture diagrams."
> "What did I store about the EBR client?"

**What's special:** Searches everything — text notes AND images AND PDFs —
all in one query. The AI gets back the top matches with similarity scores.
File results include a temporary download link.

---

### Tool 5: get_file_url

**What it does:** Generates a fresh temporary download link for a specific
stored file. Useful when a link has expired or you need to access a file directly.

**Inputs:**
- `memory_id` — The ID of the stored memory (required)
- `expires_in` — How long the link should work, in seconds (default: 3600 = 1 hour)

**Example use:**
> "Get me a fresh download link for memory #42."

---

### Tool 6: list_memories

**What it does:** Lists everything stored in your brain, with optional filtering.
Like browsing through a catalog of everything you've saved.

**Inputs:**
- `limit` — How many to return (default: 20)
- `offset` — Where to start (for paging through large collections)
- `content_type` — Optional filter: only show "text", "image", etc.
- `search` — Optional keyword filter on the content text

**Example use:**
> "Show me everything stored in my brain."
> "List all the images I've stored."
> "Show me the 20 most recently stored memories."

---

### Tool 7: update_memory

**What it does:** Updates an existing memory with new content. The vector
(embedding) is automatically recalculated to match the new content.

**Inputs:**
- `id` — The ID of the memory to update (required)
- `content` — New text content
- `metadata` — New or updated metadata

**Example use:**
> "Update memory #42 — the EBR API switched from OAuth 2.0 to API keys in March 2026."

**What happens internally:** Sends new content to Gemini → gets new vector →
updates both the content AND the vector in the database. The old vector is replaced.

---

### Tool 8: delete_memory

**What it does:** Permanently removes a memory from your brain. If the memory
has an associated file, the file is also deleted from Supabase Storage.

**Inputs:**
- `id` — The ID of the memory to delete (required)

**Example use:**
> "Delete that grocery list I stored last week." (after finding its ID with list_memories)

**Note:** This is permanent. The data cannot be recovered after deletion.

---

### Tool 9: get_stats

**What it does:** Gives you an overview of your Digital Brain's contents.
How many memories? What types? How much storage used?

**Inputs:** None required.

**Example use:**
> "How much is stored in my Digital Brain?"
> "Give me a summary of my brain's contents."

**Returns something like:**
```
Total memories: 347
  - Text memories: 298
  - Images: 31
  - Documents (PDFs): 14
  - Audio files: 4

Storage used: 245 MB
Oldest memory: 2025-11-15
Newest memory: 2026-03-21
```

---

## 9. Security — How Your Data Is Protected

Your Digital Brain contains personal and potentially sensitive information.
Here's how it's protected at each layer.

### Layer 1: The API Key

Every request to your MCP server must include a valid API key. This is like
a password for the entire system.

> **Think of it like this:**
> The API key is like a physical key to a building. Without it, the door
> doesn't open. It doesn't matter how sophisticated your lock-picking
> skills are — no key, no entry.

```
Request arrives at MCP server
           ↓
    Has API key?
    ╔═════════╦═══════════╗
    ║   YES   ║    NO     ║
    ╚════╤════╩═════╤═════╝
         ↓          ↓
    Continue    Return 401 error
    processing  "Unauthorized"
                (no data exposed)
```

**Fail-closed:** If the `API_KEY` environment variable is not set up in
Vercel, *everyone* is rejected — including you. This is the safe default.
A misconfiguration leaves the system locked, not wide open.

### Layer 2: Row Level Security (RLS)

Even if someone gets your Supabase database URL, they can't read your data.
That URL just points to the database — it doesn't authorize access. Your
database's RLS policies require a **service role key** to read or write.

```
Attacker gets database URL
           ↓
    Tries to read data
           ↓
    Supabase checks RLS policies
           ↓
    No service role key?
           ↓
    Access denied — returns empty results
           ↓
    Attacker sees nothing
```

### Layer 3: The Service Role Key

The **Service Role Key** is like a master key that bypasses RLS.
It has full read/write access to your database.

**Critical:** This key is stored only in Vercel's environment variables
(server-side). It is never sent to browser clients, never included in
responses, and never exposed publicly. The AI assistants (clients) never
see this key — they only send requests to your MCP server, and *your server*
uses the key internally.

```
AI Assistant (client side)              Your MCP Server (server side)
──────────────────────────              ──────────────────────────────
                                        
Sends request with API key         →    Verifies API key
                                        Uses Service Role Key internally ← secret!
                                        Reads/writes Supabase
Receives results               ←       Sends back only the results
```

### Layer 4: Private File Storage

Files in Supabase Storage are stored in a **private bucket**. They cannot
be accessed via a direct URL — not even if someone guesses the file path.

Files can only be accessed via **signed URLs** — temporary links that:
- Are generated by your server (using the service role key)
- Expire after 1 hour (by default)
- Cannot be used after expiration
- Cannot be guessed (they contain a cryptographic token)

```
File access attempt:
─────────────────────

DIRECT PATH (doesn't work):
https://supabase.../storage/v1/object/brain-files/memories/file.png
→ 403 Forbidden (private bucket)


SIGNED URL (works, temporarily):
https://supabase.../storage/v1/object/sign/brain-files/memories/file.png?token=abc&expires=1711065600
→ 200 OK (within 1 hour of generation)
→ 403 Forbidden (after expiration)
```

### Layer 5: HTTPS Everywhere

All communication — between the AI assistant and your server, between your
server and Supabase, and between your server and Gemini — travels over **HTTPS**
(encrypted HTTP). This means data is scrambled in transit and cannot be
read by anyone intercepting the network traffic.

---

## 10. The Multimodal Magic — Cross-Modal Search

This is the feature that sets your Digital Brain apart from simple note-taking
systems. Let's understand it deeply.

### Traditional Search: Siloed by Type

In traditional search systems, different types of content exist in separate silos:

```
TRADITIONAL (SILOED) SEARCH:
─────────────────────────────

  Text index  ←─── only searches text
  
  Image index ←─── only searches images (by filename, tags, etc.)
  
  PDF index   ←─── only searches PDF text content
  
  
  You want to find "architecture diagram"?
  → Search text:   finds text notes about architecture
  → Search images: only finds images tagged "architecture" 
                   (not ones tagged "system design" or "AWS infrastructure")
  → No connection between them
```

### Multimodal Search: One Unified Map

Your Digital Brain uses a single, unified vector space for ALL content types.
Because Gemini Embedding 2 maps text, images, audio, and PDFs all onto the
*same coordinate system*, you can search once and find everything:

```
MULTIMODAL (UNIFIED) SEARCH:
──────────────────────────────

Query: "authentication and security"  →  [0.23, -0.45, 0.78, ...]
                                                    ↓
                                              One search...
                                                    ↓
  ┌─────────────────────────────────────────────────────────────────────┐
  │                    UNIFIED VECTOR SPACE                            │
  │                                                                     │
  │   Text: "OAuth 2.0 setup notes"               similarity: 0.88    │
  │   Image: padlock-diagram.png                  similarity: 0.82    │
  │   PDF: security-requirements.pdf              similarity: 0.79    │
  │   Audio: security-team-meeting.mp3            similarity: 0.71    │
  │                                                                     │
  │   Text: "Grocery shopping list"               similarity: 0.08    │
  └─────────────────────────────────────────────────────────────────────┘
  
  All results returned in ONE search, ranked by relevance.
```

### The "Interleaved Embedding" Breakthrough

When you store a file and also provide a text description, your system does
something even more powerful. Instead of creating *separate* embeddings for
the image and the text, it sends them to Gemini *together* as an interleaved
input.

> **Think of it like this:**
> Imagine describing a painting to someone. If you describe it in words alone,
> they get the description. If they see the painting alone, they get the visuals.
> But if they *look at the painting while you describe it*, they get a much
> richer, more connected understanding. The interleaved embedding is like
> that third experience — the model processes both together.

```
SEPARATE EMBEDDINGS (less powerful):
──────────────────────────────────────
  
  "OAuth flow diagram" → [vector A: meaning of description text]
  
  [image data]          → [vector B: meaning of visual content]
  
  Stored as two separate things. Search finds one or the other.


INTERLEAVED EMBEDDING (more powerful):
────────────────────────────────────────
  
  COMBINED INPUT TO GEMINI:
  ┌──────────────────────────────────────────────────┐
  │  Part 1 (text): "OAuth 2.0 authentication flow" │
  │  Part 2 (image): [actual image pixels]          │
  │  Part 3 (text): "showing the authorization..."  │
  └──────────────────────────────────────────────────┘
               ↓
  Gemini reads EVERYTHING TOGETHER
               ↓
  [vector: captures both description AND visual content]
  
  Stored as ONE thing. Search finds it whether you search
  for the visual concept OR the textual description.
```

### Practical Examples of Cross-Modal Search

```
You search for:                         You can find:
────────────────                        ─────────────

"login authentication"        →   text notes about OAuth
                                  an image of a login flow diagram
                                  a PDF about security requirements
                                  an audio recording of a security meeting

"database schema"             →   text notes about table structure
                                  an image of an ER diagram
                                  a PDF with the schema documentation

"deployment process"          →   text notes about your deploy steps
                                  a screenshot of the CI/CD pipeline
                                  a video walkthrough of a deploy
                                  a PDF of the deployment runbook
```

This is why the embedding system is the core magic. Everything else —
Vercel, Supabase, MCP, all of it — is just plumbing to make this
cross-modal, meaning-based search work reliably and securely.

---

## 11. What Each File in the Project Does

Your project has a small number of files, each with a specific purpose.
Here's a plain-English guide to each one.

```
project/
├── src/
│   └── app/
│       └── api/
│           └── mcp/
│               └── route.ts          ← Main brain: all 9 tools live here
├── lib/
│   ├── embeddings.ts                 ← Talks to Google Gemini
│   └── supabase.ts                   ← Talks to Supabase database + storage
├── supabase/
│   └── migrations/
│       ├── 001_create_memories.sql   ← Creates the database structure
│       └── 002_multimodal_upgrade.sql← Adds file support
├── package.json                      ← Lists all required libraries
├── .env.example                      ← Template of required secrets
└── README.md                         ← Setup instructions
```

### route.ts — The Brain's Command Center

This is the most important file. It's the entry point for every request
your MCP server receives. Here's what it does:

1. **Defines all 9 tools** — their names, descriptions, and required inputs.
   This is the information the AI assistant reads when it first connects,
   to learn what tools are available.

2. **Handles authentication** — Every incoming request is checked for a
   valid API key before anything else happens.

3. **Orchestrates each tool call** — When Claude calls `store_memory`,
   this file coordinates: call Gemini for the embedding, then call
   Supabase to store the result.

4. **Manages SSE connections** — Sets up and maintains the live connections
   with AI assistants using Redis.

> **Analogy:** If your Digital Brain were a restaurant, `route.ts` is the
> manager at the front desk. It greets guests (AI assistants), checks
> reservations (API keys), takes orders (tool calls), and coordinates
> the kitchen (Gemini) and storage room (Supabase) to fulfill each request.

### embeddings.ts — The Meaning Converter

This file handles all communication with Google's Gemini Embedding API.
It knows how to:

- Send **text** to Gemini and get back a vector
- Send an **image** (as raw bytes) to Gemini and get back a vector
- Send an **interleaved combination** of text + image to Gemini and get back
  a single combined vector
- Request exactly 768 dimensions (not the default 3072)
- Handle API errors gracefully

> **Analogy:** `embeddings.ts` is like a translator who speaks both English
> (your content) and "meaning-space" (the vector coordinate system).
> You hand it any content, it hands back coordinates.

Key function in this file:
```
generateEmbedding(content, options) → [768 numbers]
```

### supabase.ts — The Data Manager

This file handles all communication with Supabase — both the database
and the file storage. It knows how to:

- **Insert** new memories (text + vector) into the database
- **Query** the database for similar vectors (the search function)
- **Update** existing memories
- **Delete** memories (and their files)
- **Upload** files to Supabase Storage
- **Download** files from Supabase Storage
- **Generate signed URLs** for temporary file access
- **List** memories with filters
- **Count** memories (for `get_stats`)

> **Analogy:** `supabase.ts` is the librarian. It knows exactly where
> everything is filed (in the database), where the physical items are kept
> (in storage), how to find things by topic (vector search), and how to
> issue temporary library cards for accessing restricted materials
> (signed URLs).

### 001_create_memories.sql — The Database Blueprint

This is a SQL migration file — a set of instructions that creates your
database structure from scratch. SQL (Structured Query Language) is the
language used to talk to relational databases.

This file does the following:
1. Activates the `pgvector` extension (add-on)
2. Creates the `memories` table with all its columns
3. Creates the HNSW index for fast vector search
4. Creates a helper function called `match_memories` that handles the
   vector search query
5. Sets up RLS policies to protect the data

You run this file once, during initial setup. After that, the database
structure exists permanently.

> **Analogy:** This is the architectural blueprint for your filing system.
> You follow it once to build the filing cabinets, label the drawers, and
> install the locks. After that, you just use it.

### 002_multimodal_upgrade.sql — The File Support Upgrade

This is a second migration file — an upgrade applied after the initial setup.
It modifies the database to support files (images, PDFs, audio, video):

1. Adds new columns to the `memories` table: `file_path`, `mime_type`, `file_size`
2. Creates the `brain-files` storage bucket in Supabase Storage
3. Sets storage access policies (private bucket, server-only access)
4. Updates the `match_memories` function to return the new columns

> **Analogy:** You already built the filing cabinet (migration 001).
> This upgrade adds a new section for physical items — a shelf for
> photos and a drawer for folders/documents — and updates the catalog
> system to note when something has a physical component.

### package.json — The Ingredients List

Every JavaScript/TypeScript project has a `package.json` file that lists
the software libraries ("packages") the project depends on.

> **Think of it like this:**
> A recipe might say "you need flour, eggs, butter, and vanilla."
> `package.json` lists all the ingredients (libraries) your code needs.
> When you run `npm install`, npm (the package manager) downloads all the
> listed ingredients from the internet.

Key libraries in your project:

```
@modelcontextprotocol/sdk   ← Handles the MCP protocol (the USB standard)
@google/generative-ai       ← Google's library for talking to Gemini
@supabase/supabase-js       ← Supabase's library for database + storage
@upstash/redis              ← Redis client for managing SSE connections
next                        ← Next.js web framework (what Vercel uses)
typescript                  ← TypeScript (JavaScript with type safety)
```

### .env.example — The Secrets Template

Environment variables are secret keys and configuration values that your
code needs but shouldn't have hardcoded in the source files.

`.env.example` is a *template* showing which secrets are needed, without
revealing the actual values. It looks like:

```
# Your Digital Brain - Environment Variables
# Copy this to .env.local and fill in your values

# Security: Master API key for MCP connections
API_KEY=your_api_key_here

# Supabase: Database and storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Google AI: Gemini embedding model
GOOGLE_AI_API_KEY=your_google_ai_key_here

# Redis: Upstash Redis for SSE connection management
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token_here
```

The actual values (the real keys) are stored in Vercel's environment
variable settings, not in any file in the repository.

---

## 12. Glossary

A quick reference for every technical term used in this document.

---

**API** (Application Programming Interface)
A defined way for two software programs to talk to each other.
Think of it as the menu in a restaurant — it defines exactly what you can
order and what format to make your request in. Your MCP server *is* an API.

---

**API Key**
A secret string of characters (like a password) that identifies and
authorizes a caller. Example: `sk-abc123xyz789`. Every request to your
Digital Brain must include your API key.

---

**Base64**
A way to encode binary data (like image files, which are bytes) as plain
text characters. Because you can't reliably send raw bytes in a text-based
message, they get converted to a string of letters, numbers, `+`, and `/`.
An AI assistant sends image files to your MCP server as base64.
Example: `iVBORw0KGgoAAAANSUhEUgAA...`

---

**Bearer Token**
A type of API key delivered in the HTTP `Authorization` header.
The format is: `Authorization: Bearer your-api-key-here`.
Your MCP server expects API keys delivered this way.

---

**Cosine Similarity**
A way to measure how similar two vectors are by computing the cosine of
the angle between them. Returns a value from -1 to 1, where:
- 1.0 = identical direction (very similar meaning)
- 0.0 = perpendicular (unrelated)
- -1.0 = opposite directions (opposite meanings)
Used to rank search results by relevance.

---

**Embedding**
A vector (list of numbers) that represents the meaning of a piece of
content. Generated by running content through an embedding model like
Gemini Embedding 2. Similar content produces similar (nearby) embeddings.
The core technology that enables meaning-based search.

---

**HNSW** (Hierarchical Navigable Small World)
An algorithm for building a special index that makes vector search fast.
Organizes vectors in a multi-layer graph structure that allows the database
to find similar vectors quickly without comparing against every single stored
vector. Like an index in the back of a textbook — points you to the right
neighborhood quickly.

---

**MCP** (Model Context Protocol)
An open standard protocol developed by Anthropic that lets AI assistants
communicate with external tools and services in a standardized way.
Like USB for AI tools — any MCP-compatible AI can connect to any
MCP-compatible server.

---

**MIME Type**
A standardized label that identifies a file's format.
Examples: `image/png`, `image/jpeg`, `application/pdf`, `audio/mp3`,
`video/mp4`, `text/plain`. Your server uses MIME types to know how to
handle each file.

---

**MRL** (Matryoshka Representation Learning)
A training technique that teaches an embedding model to pack the most
important information into the first N dimensions. Named after Russian
Matryoshka nesting dolls. Allows using just 768 of the model's 3072
output dimensions while retaining most of the semantic meaning.

---

**Next.js**
A web application framework built on top of Node.js, designed for
building server-side and serverless web applications. Vercel created
Next.js. Your MCP server is built using Next.js API routes.

---

**Node.js**
A runtime environment that lets JavaScript code run on a server (not
just in a browser). Your MCP server code is written in TypeScript
(a type-safe version of JavaScript) and runs on Node.js.

---

**pgvector**
A PostgreSQL extension (plugin) that adds support for storing, indexing,
and searching vector data. Adds a `vector` column type and operators
like `<=>` (cosine distance) to PostgreSQL. Powers the semantic search
in your Digital Brain.

---

**PostgreSQL** (also called "Postgres")
A powerful, open-source relational database management system (RDBMS).
Stores data in tables with rows and columns. Trusted by major companies
worldwide. Supabase is built on top of PostgreSQL.

---

**RLS** (Row Level Security)
A PostgreSQL feature that controls which rows a user can see or modify,
based on policies you define. Adds a security layer on top of the
database — even users who can connect to the database can only access
data their policies allow.

---

**RPC** (Remote Procedure Call)
A way for one program to call a function on another computer over the
network. In your system, Supabase RPC calls are how your server calls
stored functions in the database, like the `match_memories` function
that performs vector search.

---

**Serverless**
A cloud computing model where code runs only when triggered by a request,
and stops immediately after. You don't manage servers or pay for idle
time. Vercel runs your MCP server as serverless functions.

---

**Signed URL**
A temporary web link to a private file, with a cryptographic signature
that proves it was generated by an authorized server. The link expires
after a set time (e.g., 1 hour). Used to provide time-limited access
to files in Supabase's private storage bucket.

---

**SQL** (Structured Query Language)
The standard language for interacting with relational databases.
Used to create tables, insert data, query data, and manage permissions.
Example: `SELECT * FROM memories WHERE id = 42;`

---

**SSE** (Server-Sent Events)
A web standard for one-way real-time communication from server to client
over a persistent HTTP connection. The client connects once and the server
can send multiple messages over time. Used by your MCP server to stream
responses back to AI assistants.

---

**Supabase**
An open-source backend-as-a-service platform built on PostgreSQL.
Provides a hosted database, file storage, authentication, and APIs.
Used as the persistence layer (where data is stored) for your Digital Brain.

---

**Vector**
A list of numbers. In machine learning, vectors are used to represent
content numerically so computers can do math on it. Your Digital Brain
uses 768-dimensional vectors (lists of 768 decimal numbers) to represent
the meaning of stored content.

---

**Vercel**
A cloud platform for deploying web applications and serverless functions.
Hosts your MCP server, handles auto-deployment from GitHub, and manages
environment variables. Built by the same company that created Next.js.

---

*End of Glossary*

---

## Putting It All Together

You've built something genuinely impressive. Let's do a final high-level
recap to make sure the big picture is crystal clear.

```
╔══════════════════════════════════════════════════════════════════════════╗
║                        WHAT YOU BUILT                                   ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  A personal knowledge base that:                                        ║
║                                                                          ║
║  ✓ Stores text, images, PDFs, audio, and video                          ║
║  ✓ Understands MEANING (not just keywords) when searching               ║
║  ✓ Works with ANY MCP-compatible AI (Claude, Cursor, Copilot...)        ║
║  ✓ Searches across ALL content types simultaneously                     ║
║  ✓ Is always on (hosted on Vercel, no local server needed)              ║
║  ✓ Is secured with API keys and database-level access controls          ║
║  ✓ Files are privately stored with expiring access links                ║
║  ✓ Cross-modal: find images by searching text, and vice versa           ║
║                                                                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║  KEY TECHNOLOGIES AND THEIR ROLES:                                      ║
║                                                                          ║
║  MCP Protocol    → Standard language so any AI can use your brain      ║
║  Gemini Embed 2  → Converts any content to 768 meaning-numbers         ║
║  pgvector        → Stores and searches those meaning-numbers           ║
║  Supabase        → Hosts database + file storage in the cloud          ║
║  Vercel          → Hosts your server code, serverless, always on       ║
║  Redis/Upstash   → Manages live AI assistant connections               ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

The system's magic comes from one core insight: **meaning can be converted
to numbers**. Once everything — text, images, audio, video, PDFs — is
expressed as numbers in a shared coordinate system, finding related things
becomes a matter of finding nearby coordinates. Gemini Embedding 2 creates
that shared coordinate system. Everything else supports, stores, and exposes
the results of that fundamental capability.

You didn't just build a note-taking app with AI wrappers. You built a
persistent, multimodal, semantically-indexed external memory for every
AI assistant you use. That's a meaningful piece of infrastructure.

---

*Document version: 1.0 | Created: March 2026*
*For the Digital Brain MCP project*
