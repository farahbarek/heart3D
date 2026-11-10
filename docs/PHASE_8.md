# Phase 8 — validation plan and documentation

## Objectif

Valider le projet de manière progressive et scientifique avant de passer à des ajouts majeurs.

## Checklist de validation

1. Vérifier l’installation backend
   - `pip install -r backend/requirements.txt`
2. Vérifier l’API FastAPI
   - `uvicorn backend.app.main:app --reload`
   - `curl http://localhost:8000/api/health`
3. Vérifier le frontend React
   - `cd frontend && npm install && npm run build`
4. Vérifier les points d’entrée principaux
   - patients
   - upload imaging
   - segmentation run
   - simulation respiratory
5. Vérifier les comportements d’erreur
   - mauvaise extension de fichier
   - patient non existant
   - ID non trouvé
6. Vérifier la documentation
   - README.md
   - installation guide
   - limites scientifiques

## Limites scientifiques

- Ce projet reste un prototype.
- Les simulations respiratoires doivent être interprétées comme des démonstrations numériques.
- Les connexions réelles à des modèles MONAI Physio doivent être validées sur GPU compatible.

## Prochaines étapes recommandées

1. finaliser la vraie intégration MONAI Physio sur GPU,
2. connecter le frontend aux endpoints FastAPI,
3. ajouter les écrans de gestion de patients et d’images,
4. intégrer la segmentation 3D côté frontend et côté backend,
5. stabiliser les tests d’intégration et la documentation. 
