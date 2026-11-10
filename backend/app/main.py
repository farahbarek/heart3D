from __future__ import annotations

import base64
import io
import math
import uuid
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Pulmonary Digital Twin API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_SERIES_FILES = 200
MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_TOTAL_BYTES = 256 * 1024 * 1024
MAX_PREVIEW_EDGE = 512


class PatientCreate(BaseModel):
    patient_id: str = Field(..., min_length=3)
    name: str = Field(..., min_length=2)
    age: int = Field(..., ge=0, le=150)
    sex: str = Field(..., pattern=r"^(M|F|O|Unknown)$")


class PatientRecord(BaseModel):
    id: str
    name: str
    age: int
    sex: str


class ImagingRecord(BaseModel):
    id: str
    patient_id: str
    file_name: str
    file_type: str
    dimensions: list[int]
    status: str = "uploaded"


class SegmentationRequest(BaseModel):
    patient_id: str
    model_name: str = "monai-default-segmentation"
    use_synthetic_data: bool = True


class SimulationRequest(BaseModel):
    patient_id: str
    model_name: str = "lung-respiratory-demo"
    stages: list[float] = Field(default_factory=lambda: [0.0, 0.25, 0.5, 0.75, 1.0])


patients_db: list[PatientRecord] = [
    PatientRecord(id="P-001", name="Demo Patient", age=57, sex="F"),
    PatientRecord(id="P-002", name="Clinical Case 2", age=63, sex="M"),
]

imaging_db: dict[str, ImagingRecord] = {
    "IMG-001": ImagingRecord(
        id="IMG-001",
        patient_id="P-001",
        file_name="clinical_volume.nii.gz",
        file_type="nifti",
        dimensions=[256, 256, 80],
    )
}
segmentation_db: dict[str, Any] = {}
simulation_db: dict[str, Any] = {}


def _dicom_position(ds: Any) -> tuple[float, float, float]:
    position = getattr(ds, "ImagePositionPatient", None)
    if position is None:
        instance = float(getattr(ds, "InstanceNumber", 0))
        return (0.0, 0.0, instance)
    return tuple(float(value) for value in position[:3])


def _sort_key(ds: Any) -> float:
    position = _dicom_position(ds)
    orientation = getattr(ds, "ImageOrientationPatient", None)
    if orientation is not None and len(orientation) >= 6:
        row = np.asarray(orientation[:3], dtype=np.float64)
        column = np.asarray(orientation[3:6], dtype=np.float64)
        normal = np.cross(row, column)
        return float(np.dot(np.asarray(position), normal))
    return position[2]


def _preview_png(ds: Any) -> str:
    from PIL import Image

    pixels = np.asarray(ds.pixel_array)
    if pixels.ndim != 2:
        raise ValueError("Seules les images DICOM monochromes 2D sont prises en charge.")

    pixels = pixels.astype(np.float32)
    slope = float(getattr(ds, "RescaleSlope", 1.0))
    intercept = float(getattr(ds, "RescaleIntercept", 0.0))
    pixels = pixels * slope + intercept

    center = getattr(ds, "WindowCenter", None)
    width = getattr(ds, "WindowWidth", None)
    if center is not None and width is not None:
        center_value = float(center[0] if hasattr(center, "__len__") else center)
        width_value = max(1.0, float(width[0] if hasattr(width, "__len__") else width))
        low, high = center_value - width_value / 2, center_value + width_value / 2
    else:
        low, high = (float(v) for v in np.percentile(pixels, [1, 99]))
        if high <= low:
            low, high = float(np.min(pixels)), float(np.max(pixels))
        if high <= low:
            high = low + 1.0

    pixels = np.clip((pixels - low) * (255.0 / (high - low)), 0, 255).astype(np.uint8)
    if str(getattr(ds, "PhotometricInterpretation", "MONOCHROME2")) == "MONOCHROME1":
        pixels = 255 - pixels

    image = Image.fromarray(pixels, mode="L")
    image.thumbnail((MAX_PREVIEW_EDGE, MAX_PREVIEW_EDGE))
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "healthy", "service": "pulmonary-digital-twin"}


@app.get("/api/patients")
def get_patients() -> list[PatientRecord]:
    return patients_db


@app.post("/api/patients")
def create_patient(payload: PatientCreate) -> PatientRecord:
    if any(patient.id == payload.patient_id for patient in patients_db):
        raise HTTPException(status_code=400, detail="Patient already exists.")
    patient = PatientRecord(id=payload.patient_id, name=payload.name, age=payload.age, sex=payload.sex)
    patients_db.append(patient)
    return patient


@app.post("/api/imaging/upload")
async def upload_image(file: UploadFile = File(...)) -> dict[str, Any]:
    """Legacy single-file metadata endpoint. Use /api/imaging/series for DICOM stacks."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")
    lower = file.filename.lower()
    if not (lower.endswith(".nii") or lower.endswith(".nii.gz") or lower.endswith(".dcm") or lower.endswith(".mha")):
        raise HTTPException(status_code=400, detail="Unsupported image format.")
    image_id = f"IMG-{len(imaging_db) + 1:03d}"
    record = ImagingRecord(
        id=image_id,
        patient_id="P-001",
        file_name=file.filename,
        file_type="nifti" if lower.endswith((".nii", ".nii.gz")) else "dicom",
        dimensions=[],
    )
    imaging_db[image_id] = record
    return {"message": "Image metadata registered; this legacy endpoint does not reconstruct a volume.", "image": record}


@app.post("/api/imaging/series")
async def upload_dicom_series(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    """Read an uploaded DICOM series in memory and return ordered, browser-ready slice previews."""
    if not files:
        raise HTTPException(status_code=400, detail="Sélectionnez une série de fichiers DICOM.")
    if len(files) > MAX_SERIES_FILES:
        raise HTTPException(status_code=413, detail=f"La série dépasse la limite de {MAX_SERIES_FILES} coupes.")

    try:
        import pydicom
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="Dépendance pydicom manquante. Installez backend/requirements.txt.") from exc

    parsed: dict[str, list[tuple[Any, str]]] = {}
    total_bytes = 0
    try:
        for upload in files:
            if not upload.filename:
                continue
            raw = await upload.read(MAX_FILE_BYTES + 1)
            if not raw:
                continue
            if len(raw) > MAX_FILE_BYTES:
                raise HTTPException(status_code=413, detail=f"Le fichier {upload.filename} dépasse 64 Mo.")
            total_bytes += len(raw)
            if total_bytes > MAX_TOTAL_BYTES:
                raise HTTPException(status_code=413, detail="La série dépasse la limite totale de 256 Mo.")
            try:
                ds = pydicom.dcmread(io.BytesIO(raw), force=False)
                if not hasattr(ds, "PixelData"):
                    continue
                if int(getattr(ds, "SamplesPerPixel", 1)) != 1:
                    raise ValueError("Les coupes couleur ou multi-échantillons ne sont pas prises en charge.")
                series_uid = str(getattr(ds, "SeriesInstanceUID", "")).strip() or "unknown"
                parsed.setdefault(series_uid, []).append((ds, upload.filename))
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Fichier DICOM invalide ({upload.filename}) : {exc}") from exc
            finally:
                await upload.close()
    finally:
        for upload in files:
            if not upload.file.closed:
                await upload.close()

    if not parsed:
        raise HTTPException(status_code=400, detail="Aucun fichier DICOM avec pixels n’a été trouvé.")

    series_results: list[dict[str, Any]] = []
    for series_uid, series_files in parsed.items():
        series_dimensions = {(int(ds.Rows), int(ds.Columns)) for ds, _ in series_files}
        if len(series_dimensions) != 1:
            raise HTTPException(status_code=400, detail="Les coupes d’une même série n’ont pas toutes les mêmes dimensions.")

        series_files.sort(key=lambda item: _sort_key(item[0]))
        rows, columns = next(iter(series_dimensions))
        spacing = getattr(series_files[0][0], "PixelSpacing", [1.0, 1.0])
        slice_positions = [_sort_key(ds) for ds, _ in series_files]
        gaps = [abs(b - a) for a, b in zip(slice_positions, slice_positions[1:]) if abs(b - a) > 1e-5]
        slice_spacing = float(np.median(gaps)) if gaps else float(getattr(series_files[0][0], "SliceThickness", 1.0))

        slices: list[dict[str, Any]] = []
        for ds, filename in series_files:
            try:
                slices.append({"file_name": filename, "position": _sort_key(ds), "image_data": _preview_png(ds)})
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"Impossible de décoder les pixels de {filename}. Vérifiez la compression DICOM et ses codecs : {exc}",
                ) from exc

        first_dataset = series_files[0][0]
        series_results.append({
            "series_id": f"SER-{uuid.uuid4().hex[:12]}",
            "series_number": str(getattr(first_dataset, "SeriesNumber", "")),
            "series_description": str(getattr(first_dataset, "SeriesDescription", "")).strip(),
            "file_count": len(slices),
            "dimensions": [columns, rows, len(slices)],
            "spacing_mm": [float(spacing[0]), float(spacing[1]), slice_spacing],
            "slices": slices,
        })

    return {
        "series": series_results,
        "notice": "Aperçu de visualisation uniquement ; pas un outil de diagnostic médical.",
    }


@app.get("/api/imaging/{image_id}")
def get_imaging(image_id: str) -> ImagingRecord:
    if image_id not in imaging_db:
        raise HTTPException(status_code=404, detail="Image not found.")
    return imaging_db[image_id]


@app.post("/api/segmentation/run")
def run_segmentation(payload: SegmentationRequest) -> dict[str, Any]:
    seg_id = f"SEG-{len(segmentation_db) + 1:03d}"
    result = {
        "id": seg_id,
        "patient_id": payload.patient_id,
        "status": "demo_only",
        "model_name": payload.model_name,
        "use_synthetic_data": payload.use_synthetic_data,
        "message": "Aucun modèle de segmentation médicale n’est exécuté par ce prototype.",
    }
    segmentation_db[seg_id] = result
    return result


@app.get("/api/segmentation/{seg_id}")
def get_segmentation(seg_id: str) -> dict[str, Any]:
    if seg_id not in segmentation_db:
        raise HTTPException(status_code=404, detail="Segmentation not found.")
    return segmentation_db[seg_id]


@app.post("/api/reconstruction/3d")
def reconstruction_3d() -> dict[str, Any]:
    return {"status": "not_configured", "message": "Importez une série DICOM via /api/imaging/series pour obtenir son volume de prévisualisation."}


@app.post("/api/simulation/respiratory")
def run_synthetic_simulation(payload: SimulationRequest) -> dict[str, Any]:
    sim_id = f"SIM-{len(simulation_db) + 1:03d}"
    result = {
        "id": sim_id,
        "patient_id": payload.patient_id,
        "status": "demo_only",
        "model_name": payload.model_name,
        "stages": payload.stages,
        "message": "Simulation illustrative ; aucun résultat physiologique n’est calculé.",
    }
    simulation_db[sim_id] = result
    return result


@app.get("/api/simulation/{sim_id}")
def get_simulation(sim_id: str) -> dict[str, Any]:
    if sim_id not in simulation_db:
        raise HTTPException(status_code=404, detail="Simulation not found.")
    return simulation_db[sim_id]


@app.get("/api/reports/{report_id}")
def get_report(report_id: str) -> dict[str, Any]:
    if report_id == "demo":
        return {
            "id": report_id,
            "title": "Pulmonary digital twin report",
            "status": "ready",
            "summary": "Prototype report generated from clinical metadata and simulation output.",
        }
    raise HTTPException(status_code=404, detail="Report not found.")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
