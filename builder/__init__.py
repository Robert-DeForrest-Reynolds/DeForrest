from io import TextIOWrapper
from os import getcwd
from pathlib import Path


HEAD = """\
<head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1" name="viewport"/>
  <title>DeForrest Compendium</title>
  <link rel="stylesheet" href="styles.css">
</head>\
"""

CURRENT_DIR = getcwd()

LOGFILE_PATH = Path(CURRENT_DIR, "BuildLog.log")
LOGFILE: TextIOWrapper = LOGFILE_PATH.open("w+")

SCAFFOLD_DIR = Path("Scaffold")
SCAFFOLD_HTML = Path(SCAFFOLD_DIR, ".html")
SCAFFOLD_CSS = Path(SCAFFOLD_DIR, ".css")
SCAFFOLD_JS = Path(SCAFFOLD_DIR, ".js")

STANDALONE_PATH = Path("StandaloneDeForrestCompendium.html")
STANDALONE_FILE = STANDALONE_PATH.open("w+")


def Log(message:str) -> None:
    print(f"{message}")
    LOGFILE.write(message)
