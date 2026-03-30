# Astrolabe (Prototype)

> **This repository is the early prototype of Astrolabe and is no longer actively maintained.**
> The latest version is being developed at **[factorin-dev/Astrolabe](https://github.com/factorin-dev/Astrolabe)** — a new public release is coming soon.

A 3D dependency graph visualization tool for Lean 4 formalization projects. Astrolabe parses your Lean codebase, builds a dependency graph, and renders it in an interactive 3D space.

[![Website](https://img.shields.io/badge/Website-astrolabe--lean.io-blue)](https://astrolabe-lean.io)
[![Docs](https://img.shields.io/badge/Docs-Read-green)](https://astrolabe-lean.io/docs)
[![YouTube](https://img.shields.io/badge/YouTube-Tutorial%20Series-red)](https://www.youtube.com/@xinzzzzz-v7i)

<p align="center">
  <img src="docs/images/screenshot-1.jpg" width="80%" />
</p>

## Features

- 3D force-directed graph visualization with namespace clustering
- Lean 4 `.ilean` parsing, file watching, sorry detection
- Fuzzy search, namespace browser, dependency explorer
- Monaco editor with Lean 4 syntax highlighting
- Markdown notes with KaTeX math rendering
- 30+ graph analysis algorithms (PageRank, community detection, spectral clustering, Ricci curvature)

## Architecture

Next.js + Three.js frontend, Python/FastAPI backend, Tauri (Rust) desktop wrapper.

## Quick Start

```bash
git clone https://github.com/Xinze-Li-Moqian/Astrolabe.git
cd Astrolabe
npm install
cd backend && pip install -e ".[dev]" && cd ..
npm run dev:all
```

## Collaborating Team

**[Xinze Li](https://lixinze.xyz/)** · **[Alejandro Radisic](https://github.com/alerad)**

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
