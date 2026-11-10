from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Pulmonary Digital Twin API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    stages: list[float] = [0.0, 0.25, 0.5, 0.75, 1.0]


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

segmentation_db: dict[str, Any] = {
    "SEG-001": {
        "id": "SEG-001",
        "patient_id": "P-001",
        "status": "completed",
        "model_name": "monai-default-segmentation",
        "dice_score": 0.94,
    }
}

simulation_db: dict[str, Any] = {
    "SIM-001": {
        "id": "SIM-001",
        "patient_id": "P-001",
        "status": "completed",
        "model_name": "lung-respiratory-demo",
        "stages": [0.0, 0.25, 0.5, 0.75, 1.0],
    }
}


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

    patient = PatientRecord(
        id=payload.patient_id,
        name=payload.name,
        age=payload.age,
        sex=payload.sex,
    )
    patients_db.append(patient)
    return patient


@app.post("/api/imaging/upload")
async def upload_image(file: UploadFile = File(...)) -> dict[str, Any]:
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
        dimensions=[256, 256, 80],
    )
    imaging_db[image_id] = record
    return {
        "message": "Image uploaded successfully.",
        "image": record,
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
        "status": "completed",
        "model_name": payload.model_name,
        "use_synthetic_data": payload.use_synthetic_data,
        "dice_score": 0.93,
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
    return {
        "status": "completed",
        "model_format": "stl",
        "output_path": "outputs/lung_model.stl",
    }


@app.post("/api/simulation/respiratory")
def run_synthetic_simulation(payload: SimulationRequest) -> dict[str, Any]:
    sim_id = f"SIM-{len(simulation_db) + 1:03d}"
    result = {
        "id": sim_id,
        "patient_id": payload.patient_id,
        "status": "completed",
        "model_name": payload.model_name,
        "stages": payload.stages,
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
