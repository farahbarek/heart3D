from __future__ import annotations

from pathlib import Path


def create_project_structure() -> None:
    directories = [
        "backend/app/api",
        "backend/app/models",
        "backend/app/services",
        "backend/app/imaging",
        "backend/app/segmentation",
        "backend/app/reconstruction",
        "backend/app/simulation",
        "frontend/src/components",
        "frontend/src/pages",
        "frontend/src/services",
        "frontend/src/visualization",
        "notebooks",
        "data",
        "models",
        "outputs",
    ]
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)


if __name__ == "__main__":
    create_project_structure()
    print("Project structure initialized.")
