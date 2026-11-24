# Self-ingesting content, and then rebuilding
# Generated finalized standalone .html file
# Full-access to CSS
# Full-access to JavaScript

# Scaffold Parse Phase
# Build Phase
# Ingest Phase

# Features
# - Top Toolbar
# - Movable Toolboxes
# - Node/Graph Explorer
# - Search
# - Command Palette
# - Document Presentation & Management
# - Offline Package for Downloading
# - Online Landing Page Implementation Specification

from builder import *


if __name__ == "__main__":
    Log(f"Working directory: {CURRENT_DIR}")

    finalized_string: str = HEAD
    STANDALONE_FILE.write(finalized_string)
