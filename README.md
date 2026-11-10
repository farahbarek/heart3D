# heart3D

Ce dépôt contient désormais une base de projet Digital Twin pulmonaire avec :
- un frontend React + TypeScript + Tailwind,
- un backend FastAPI Python,
- un ensemble de modèles de données et d’API pour patients, imagerie, segmentation et simulation,
- une starting point pour la validation Phase 8.

## Structure

```text
frontend/
backend/
notebooks/
models/
outputs/
data/
```

## Démarrage rapide

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## API de démonstration

- GET /api/health
- GET /api/patients
- POST /api/patients
- POST /api/imaging/upload
- GET /api/imaging/{id}
- POST /api/segmentation/run
- GET /api/segmentation/{id}
- POST /api/reconstruction/3d
- POST /api/simulation/respiratory
- GET /api/simulation/{id}
- GET /api/reports/{id}

## Limite scientifique

Ce projet reste un prototype technique et ne doit pas être utilisé comme outil de diagnostic médical. Les résultats respiratoires doivent être interprétés comme une simulation numérique de démonstration, pas comme une mesure clinique.
