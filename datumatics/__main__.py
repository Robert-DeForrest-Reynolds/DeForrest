from sys import exit
if __name__ != '__main__':
    print("ERROR: Cannot import this file")
    exit(1)

from sys import argv, executable
from subprocess import run as run_subprocess
from pathlib import Path


def error(message:str) -> None: print(f"DATUMATICS: {message}")


def ingest_argument(purpose:str) -> str:
    if not argv:
        error(f'ERROR: Tried to ingest argument to: "{purpose}", but failed.')
        exit(1)
    return argv.pop(0)


module_arguments = ""

modules:dict[str, list] = {
    "ull":['-B', '-m', 'ull'],
    "unr":['-B', '-m', 'unr'],
}

argv.pop(0) # Get rid of self call

selected_module:str = ingest_argument("get selected module.")

filename:str = ingest_argument("get passed filename to hand to module")

# Parse out file extension
extension:list
if len(extension := filename.split(".")) < 2:
    print("Filename does not have extension")
else:
    filename = extension.pop(0)
    extension = extension[0]

module_arguments += f"{filename}.{extension}" if extension else filename

if selected_module not in modules:
    error("ERROR: Invalid module passed.")
    exit(1)

result = run_subprocess(
    [executable, *modules[selected_module], module_arguments],
    check=True,
    cwd=Path(__file__).resolve().parent
)
