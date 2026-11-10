from __future__ import annotations

import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import app


def _make_dicom(series_uid: str, series_number: int, position: int, rows: int, columns: int) -> bytes:
    import numpy as np
    from pydicom.dataset import FileDataset, FileMetaDataset
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid

    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    dataset = FileDataset("test.dcm", {}, file_meta=file_meta, preamble=b"\0" * 128)
    dataset.SOPClassUID = file_meta.MediaStorageSOPClassUID
    dataset.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    dataset.Modality = "CT"
    dataset.SeriesInstanceUID = series_uid
    dataset.SeriesNumber = series_number
    dataset.SeriesDescription = f"Chest series {series_number}"
    dataset.BodyPartExamined = "CHEST"
    dataset.ImagePositionPatient = [0, 0, position]
    dataset.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    dataset.PixelSpacing = [0.7, 0.7]
    dataset.SliceThickness = 1
    dataset.Rows = rows
    dataset.Columns = columns
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = "MONOCHROME2"
    dataset.BitsAllocated = 16
    dataset.BitsStored = 16
    dataset.HighBit = 15
    dataset.PixelRepresentation = 0
    dataset.PixelData = np.ones((rows, columns), dtype=np.uint16).tobytes()

    output = io.BytesIO()
    dataset.save_as(output, write_like_original=False)
    return output.getvalue()


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


def test_upload_keeps_dicom_series_separate() -> None:
    client = __import__("fastapi.testclient").testclient.TestClient(app)
    first_series_uid = "1.2.826.0.1.3680043.10.543.100"
    second_series_uid = "1.2.826.0.1.3680043.10.543.200"
    files = [
        ("files", ("series-a-2.dcm", _make_dicom(first_series_uid, 1, 1, 2, 3), "application/dicom")),
        ("files", ("series-a-1.dcm", _make_dicom(first_series_uid, 1, 0, 2, 3), "application/dicom")),
        ("files", ("series-b-2.dcm", _make_dicom(second_series_uid, 2, 1, 3, 4), "application/dicom")),
        ("files", ("series-b-1.dcm", _make_dicom(second_series_uid, 2, 0, 3, 4), "application/dicom")),
    ]

    response = client.post("/api/imaging/series", files=files)

    assert response.status_code == 200
    series = response.json()["series"]
    assert len(series) == 2
    assert {item["file_count"] for item in series} == {2}
    assert {tuple(item["dimensions"][:2]) for item in series} == {(3, 2), (4, 3)}
    assert all(
        [slice_data["position"] for slice_data in item["slices"]]
        == sorted(slice_data["position"] for slice_data in item["slices"])
        for item in series
    )
