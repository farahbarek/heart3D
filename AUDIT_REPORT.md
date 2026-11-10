# Rapport d’audit technique — heart3D

**Périmètre audité :** branche `main`, commit `3b37c8d11fa3a7af065ba64ed750327e19eb442a` (référence consultée le 10 novembre 2026). Audit statique des fichiers suivis dans ce commit et vérification des sources officielles MONAI Physio. Aucun fichier médical n’a été modifié.

> **Limite de vérification :** l’environnement d’audit donne accès au code GitHub, mais ne permet pas d’installer les dépendances ni d’exécuter Python, pytest, npm/Vite, un navigateur, un GPU ou les traitements MONAI. Les tests marqués « non exécutés » ne sont donc pas réputés réussis. Les constats de code sont des vérifications statiques, pas des tests d’exécution.

## 1. Présentation générale du projet

Le dépôt est un petit prototype web React/Vite et FastAPI pour un tableau de bord présenté comme un « Pulmonary Digital Twin ». L’application ne constitue pas encore un pipeline de jumeau numérique : les données de patients et d’imagerie du backend sont en mémoire et préremplies, la segmentation et la simulation renvoient des valeurs de démonstration, et la reconstruction renvoie seulement un chemin de fichier annoncé.

Sources : [README.md](README.md), [backend/app/main.py](backend/app/main.py), [frontend/src/App.tsx](frontend/src/App.tsx).

## 2. Architecture technique réelle

Inventaire constaté sur `main` :

```text
.
├── 3D.ipynb                  # Notebook Colab / notes et essais du projet
├── README.md                 # Démarrage et liste indicative des routes
├── backend/
│   ├── app/
│   │   ├── main.py            # API FastAPI monolithique, données en mémoire
│   │   └── project_init.py    # Script qui crée une arborescence vide
│   └── requirements.txt       # FastAPI, Uvicorn, Pydantic, multipart, NumPy
├── docs/
│   └── PHASE_8.md             # Plan de validation, limites et travaux à venir
├── frontend/
│   ├── index.html
│   ├── package.json           # React, Vite, TypeScript, Tailwind, Three/Fiber, Recharts
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── App.tsx             # Écran unique du dashboard
│       ├── index.css
│       └── main.tsx            # Point d’entrée React
└── tests/
    └── test_backend.py        # Deux tests d’API
```

Il n’y a pas de dossiers suivis `api/`, `services/`, `models/`, `imaging/`, `segmentation/`, `reconstruction/`, `simulation/`, `notebooks/`, `data/` ou `outputs/` dans l’état audité. `project_init.py` ne fait que créer certains répertoires à l’exécution ; leur présence dans ce script ne signifie pas que les modules correspondants existent.

**Flux réel :** le point d’entrée React rend `App.tsx`, qui effectue une requête HTTP directe vers `/api/health`. Les autres cartes, le graphique, l’aperçu « 3D » et les boutons sont construits dans le composant frontend et ne consomment pas les autres endpoints. FastAPI expose les routes dans un seul fichier et conserve des exemples en mémoire. Aucun service MONAI ou de stockage n’est appelé.

## 3. Fonctionnalités terminées

- **Squelette React/Vite et style Tailwind — PARTIAL.** Le point d’entrée et l’écran dashboard existent (`frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`). Il n’y a qu’une page ; aucun routeur ou composant de pages séparées.
- **API FastAPI de démonstration — PARTIAL.** Les routes sont déclarées dans `backend/app/main.py` : santé, patients, upload, lecture d’examen, segmentation, reconstruction, simulation et rapport. Leur existence ne signifie pas que les traitements scientifiques correspondants sont réalisés.
- **Création et lecture de patients — PARTIAL.** `GET /api/patients` et `POST /api/patients` fonctionnent sur une liste en mémoire ; création valide les champs et rejette un identifiant déjà utilisé. Les données disparaissent au redémarrage, il n’y a pas d’historique persistant ni de stockage réel.
- **Notebook de recherche — PARTIAL / NOT VERIFIED.** `3D.ipynb` est présent, mais son contenu n’est pas exécuté par l’application. Les cellules et résultats du notebook ne valident pas l’intégration du backend livré.

## 4. Fonctionnalités partiellement terminées

- **Dashboard — PARTIAL.** Il affiche l’état de santé de l’API ; les compteurs, tendances, état IA, pipeline et séries temporelles sont codés en dur dans `frontend/src/App.tsx` (notamment lignes 12–19 et 62–75). Les valeurs ne sont pas des statistiques lues du backend.
- **Upload médical — PARTIAL.** `POST /api/imaging/upload` vérifie seulement l’extension du nom (`backend/app/main.py`, lignes 116–137). Il ne lit pas les octets, ne stocke pas le fichier, n’analyse pas DICOM/NIfTI, ne calcule pas les dimensions, et lie toujours l’enregistrement à `P-001` avec des dimensions constantes. `.mha` est accepté mais classé « dicom ». Ce n’est donc pas un import exploitable pour traitement.
- **Liste des patients dans l’interface — NOT IMPLEMENTED.** Aucun appel frontend vers `/api/patients`, ni formulaire ou écran patients.
- **Responsive design — PARTIAL / NOT VERIFIED.** Des classes de grille adaptatives existent, mais le menu latéral est fixe et la zone principale utilise une marge fixe (`frontend/src/App.tsx`, lignes 32–52). Aucun test navigateur ou petits écrans n’a été réalisé.

## 5. Fonctionnalités non implémentées

- Gestion persistante des patients/examens et association patient-examen complète dans le serveur livré.
- Visualisation de coupes axiale, coronale ou sagittale, prétraitement d’images et affichage de métadonnées réelles.
- Segmentation IA : aucun modèle, poids, chargement d’image ou appel d’inférence. La route renvoie une valeur Dice fixe de `0.93` (`backend/app/main.py`, lignes 147–160) ; la base contient aussi une valeur exemple `0.94` (lignes 70–78). Pas de masque, pas de calcul Dice et pas de référence vérité terrain.
- Génération d’une géométrie ou d’un maillage anatomique à partir d’une image ou d’un masque.
- Chargement d’un modèle 3D dans le frontend, commandes de rotation/zoom/pan, sélection de structures, export STL/OBJ/GLB.
- Simulation respiratoire scientifique, champ de déplacement, déformation de maillage, mesure calculée ou tâche longue avec progression. La route utilise un identifiant, un modèle nominal et les phases envoyées, mais ne lance pas de calcul (`backend/app/main.py`, lignes 178–189).
- Rapport PDF : `GET /api/reports/{report_id}` renvoie uniquement un objet JSON de démonstration pour l’ID `demo` (lignes 199–208).
- Pages autonomes Patients, Medical Imaging, AI Segmentation, 3D Reconstruction, Digital Twin Simulation, Results & Reports et Settings.

## 6. Résultats des tests

**Résultats d’exécution : NOT VERIFIED.** Aucun test Python/pytest, aucune installation pip/npm, aucun build frontend, aucune requête HTTP lancée et aucun essai navigateur/GPU n’a pu être exécuté dans cet environnement.

Le dépôt contient deux tests dans `tests/test_backend.py` : test de santé et création patient. Le commit d’audit inclut le correctif du chemin de racine vers `Path(__file__).resolve().parents[1]` ; cela résout statiquement le mauvais niveau de répertoire pour `tests/test_backend.py`. Cela ne prouve pas que pytest passe : `pytest` et les dépendances de test ne sont pas déclarées dans `backend/requirements.txt`, et la dépendance de test client HTTP n’est pas explicitée.

Commandes à exécuter localement pour obtenir de vrais résultats :

```bash
python -m pip install -r backend/requirements.txt
python -m pip install pytest httpx
python -m pytest -q

cd frontend
npm install
npm run build
```

Les essais de segmentation, reconstruction et mouvement nécessitent en plus un véritable jeu de données compatible, les poids/licences éventuels, une installation MONAI Physio compatible et des ressources de calcul adaptées ; rien dans le dépôt audité ne permet de les exécuter comme fonctionnalités de l’application.

## 7. Problèmes détectés

1. **Données d’apparence clinique codées en dur.** Patients, examen, segmentation et simulation prédéfinis dans `backend/app/main.py`; compteurs et graphique de démonstration dans `frontend/src/App.tsx`.
2. **Routes donnant une fausse impression d’exécution.** Reconstruction renvoie `outputs/lung_model.stl` sans créer ce fichier (`backend/app/main.py`, lignes 169–175). Segmentation et simulation marquent un résultat comme « completed » sans lancer d’algorithme.
3. **Upload non exploitable.** Absence de lecture/stockage/inspection du fichier, association patient fixe, dimensions fictives, types `.mha` mal étiquetés (`backend/app/main.py`, lignes 116–137).
4. **Frontend déconnecté du métier.** Seul `/api/health` est appelé ; le bouton « Run simulation » n’a pas de gestionnaire d’action (`frontend/src/App.tsx`, lignes 24–29 et 79–93). Les boutons de navigation sont également sans action ni routes (lignes 39–48).
5. **CORS trop permissif pour un déploiement.** `allow_origins=["*"]` avec `allow_credentials=True` (`backend/app/main.py`, lignes 11–17). À restreindre à des origines explicitement configurées ; les navigateurs peuvent rejeter les requêtes credentialed avec origine wildcard.
6. **Validations insuffisantes pour une application médicale.** Pas de taille maximale, authentification, contrôle d’accès, traitement des données sensibles, validation du contenu réel des uploads, ni persistance.
7. **Dépendances déclarées incomplètes par rapport aux ambitions du README.** `backend/requirements.txt` n’inclut ni MONAI, PyTorch, MONAI Physio, NiBabel, pydicom, VTK/PyVista, SciPy ou pytest. Le fait que `three` et React Three Fiber figurent dans `package.json` ne signifie pas qu’ils sont utilisés.
8. **Risque de configuration frontend à vérifier par build.** Le paquet est en mode ESM (`frontend/package.json`, ligne 5), tandis que les configurations PostCSS/Tailwind utilisent la syntaxe CommonJS (`module.exports`/`require`). Sans build exécuté, la compatibilité effective n’est pas confirmée.
9. **Documentation en décalage.** README liste des répertoires absents de l’inventaire suivi et présente les routes comme API de démonstration sans détailler assez précisément les valeurs fictives. `docs/PHASE_8.md` reconnaît que l’intégration MONAI Physio, les écrans et la segmentation 3D sont encore des étapes futures.

## 8. Audit détaillé de la visualisation 3D

**Verdict : NOT IMPLEMENTED — il n’y a pas de véritable visualisation anatomique pulmonaire 3D dans le frontend audité.**

- **CT converti en volume 3D : FAIL pour le flux applicatif.** L’upload ne lit pas le contenu du fichier ni ne construit un volume ; seules une extension et des dimensions constantes sont enregistrées (`backend/app/main.py`, lignes 116–137).
- **Segmentation transformée en surface : NOT IMPLEMENTED.** Aucune sortie masque/labelmap, extraction de surface, génération de sommets ou faces, ni pipeline de reconstruction n’est présent.
- **Maillage patient transmis à l’interface : NOT IMPLEMENTED.** La route `/api/reconstruction/3d` retourne uniquement un statut, le texte `stl` et un chemin qui n’est pas généré (`backend/app/main.py`, lignes 169–175). Aucun endpoint de fichier/maillage ni chargement de résultat dans le frontend.
- **Rendu Three.js/React Three Fiber : NOT IMPLEMENTED.** Ces dépendances sont déclarées dans `frontend/package.json`, mais `frontend/src/App.tsx` n’importe ni `three`, ni `Canvas`, ni contrôles ou chargeurs. L’encart aux lignes 79–93 dessine un disque CSS avec le texte « 3D » : c’est une illustration, pas une scène anatomique.
- **Rotation, zoom, déplacement et structures séparées : NOT IMPLEMENTED.** Pas de caméra, contrôles orbitaux, maillage ou objets structuraux.
- **Formats VTK/VTP/STL/OBJ/GLB, coordonnées et unités : NOT VERIFIED / NOT IMPLEMENTED dans le flux.** Aucun lecteur de ces formats ou fichier résultat n’est fourni dans le frontend ; aucune géométrie ou métadonnée physique n’est transmise par le backend.

## 9. Audit de la simulation respiratoire

**Verdict : NOT IMPLEMENTED comme simulation scientifique connectée ; PARTIAL uniquement comme endpoint de démonstration.**

`POST /api/simulation/respiratory` retourne immédiatement « completed », le `model_name` fourni et une liste de phases (`backend/app/main.py`, lignes 49–53 et 178–189). Il ne charge pas de volume, de maillage, de champ de déplacement ou de modèle, n’appelle aucun moteur MONAI Physio, ne déforme aucune géométrie et ne calcule aucun paramètre physiologique. Le bouton du dashboard n’est pas câblé (`frontend/src/App.tsx`, ligne 86). Le graphique du dashboard est une série statique mensuelle, non un résultat de simulation (lignes 12–19 et 112–130).

## 10. Audit de l’intégration MONAI Physio

**Verdict : NOT IMPLEMENTED dans l’application.**

Dans le code suivi sous `backend/` et `frontend/`, il n’y a pas d’import `monai`, `monai_physio`, `torch`, TotalSegmentator, ni appel à un workflow ou CLI MONAI Physio. Le fichier `backend/requirements.txt` ne déclare pas ces dépendances. Aucun poids de modèle ou dossier `models/` n’est suivi dans l’inventaire du dépôt.

Le notebook racine `3D.ipynb` ne constitue pas une intégration runtime : il n’est appelé ni par FastAPI ni par React. Les notes de `docs/PHASE_8.md` (lignes 30–42) identifient elles-mêmes l’intégration MONAI Physio et la segmentation 3D comme travaux à venir.

Les tutoriels officiels MONAI Physio comportent bien des exemples de conversion/reconstruction et d’inférence de mouvement respiratoire (par exemple les scripts pulmonaires des tutoriels 03, 04 et 12 du dépôt officiel). Leur présence dans ce dépôt tiers ne signifie pas que `heart3D` les exécute. Compatibilité d’un jeu de données de patient, exécution des poids, licence du modèle et résultat clinique : **NOT VERIFIED**, aucune intégration ni exécution n’est présente ici.

Références : [MONAI Physio — dépôt officiel](https://github.com/Project-MONAI/monai-physio), [tutoriels officiels](https://project-monai.github.io/monai-physio/tutorials.html), [README du projet audité](README.md).

## 11. Tableau de synthèse final

| Module | État | Test réalisé | Problèmes |
|---|---|---|---|
| Dashboard | PARTIAL | Inspection statique de `frontend/src/App.tsx` ; pas de navigateur | Compteurs/graphique statiques ; bouton simulation inactif |
| Patients | PARTIAL | Inspection statique des routes et des deux tests | Mémoire volatile ; écran frontend absent ; tests non exécutés |
| Medical Imaging | FAIL | Inspection statique de la route upload | Aucun fichier réellement lu/sauvegardé, métadonnées fictives, pas d’affichage de coupes |
| Segmentation IA | NOT IMPLEMENTED | Recherche d’imports/dépendances et lecture de la route | Aucune inférence ; Dice statique ; aucun masque ou poids |
| Reconstruction 3D | NOT IMPLEMENTED | Inspection de la route reconstruction | Aucun maillage créé ; chemin STL fictif |
| Visualisation 3D | NOT IMPLEMENTED | Inspection du rendu et des imports frontend | Disque CSS « 3D » ; aucun rendu Three.js/R3F |
| Simulation respiratoire | NOT IMPLEMENTED | Inspection de la route et du dashboard | Pas de modèle/volume/DDF ; réponse immédiate statique |
| Backend API | PARTIAL | Inspection statique ; exécution HTTP non possible | Plusieurs routes de démonstration, mémoire volatile, sécurité et upload incomplets |
| Frontend | PARTIAL | Inspection statique ; build non exécuté | Dashboard unique ; navigation sans action ; pas d’écrans métier |
| MONAI Physio | NOT IMPLEMENTED | Inspection du code et des dépendances du dépôt | Aucun import, package, workflow, poids ou résultat MONAI Physio connecté |

## 12. Recommandations et corrections prioritaires

1. **Ne pas présenter les sorties actuelles comme résultats médicaux ou scientifiques.** Afficher clairement les valeurs de démonstration ou retirer leur statut « completed » tant qu’aucun traitement réel n’a tourné.
2. **Valider l’environnement de build/test en premier.** Exécuter localement les commandes de la section 6 et consigner les sorties ; corriger les éventuelles erreurs de configuration ESM/CommonJS et compléter les dépendances de test si nécessaire.
3. **Définir un pipeline scientifique minimal vérifiable.** Choisir un tutoriel MONAI Physio pulmonaire et son jeu de données autorisé ; documenter versions, modèle/poids, licence, entrées, sorties et protocole d’évaluation. Tester hors requête Web avant de l’exposer à l’API.
4. **Définir les contrats de données avant de connecter l’interface.** Identifiants patients/examens, métadonnées physiques (affine, espacement, orientation), statuts de traitement, progression et chemins de résultats ; ne pas supposer que `STL` ou `Three.js` préservent seuls les coordonnées médicales.
5. **Pour une vraie reconstruction 3D :** lire un examen supporté, produire/valider un masque, générer un maillage réel et vérifier sommet/face, orientation et unités ; servir un format effectivement pris en charge puis charger ce maillage dans une scène 3D interactive. Tester avec une donnée de démonstration licite.
6. **Pour un vrai mouvement respiratoire :** appeler le workflow MONAI Physio compatible avec les entrées retenues, persister les sorties/phases et métriques obtenues, et distinguer l’inférence calculée d’une animation illustrative.
7. **Avant toute donnée patient réelle :** restreindre CORS, ajouter authentification/autorisation, limites et validation d’upload, stockage contrôlé, journalisation prudente et procédure de protection des données. Le prototype n’est pas un dispositif médical.

**Conclusion prioritaire :** selon le code actuellement audité, le projet ne possède ni reconstruction anatomique 3D fonctionnelle, ni simulation respiratoire réelle, ni intégration MONAI Physio opérationnelle. Le visuel nommé « 3D » est décoratif et les endpoints de segmentation/simulation/reconstruction sont des réponses de démonstration. Les tests d’exécution restent à faire dans un environnement local adapté.
