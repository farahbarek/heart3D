from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import app


def test_health() -> None:
    client = __import__("fastapi.testclient").testclient.TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_create_patient() -> None:
    client = __import__("fastapi.testclient").testclient.TestClient(app)
    payload = {"patient_id": "P-999", "name": "Test Patient", "age": 44, "sex": "F"}
    response = client.post("/api/patients", json=payload)
    assert response.status_code == 200
    assert response.json()["id"] == "P-999"
