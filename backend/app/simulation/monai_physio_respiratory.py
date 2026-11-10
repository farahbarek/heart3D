"""Run the official MONAI Physio pretrained lung-motion workflow (Tutorial 00).

The official demonstration uses a real static Chest-CT sample and the official
pretrained PhysicsNeMo MeshGraphNet plus its matching PCA model. Since this CT
is ungated, output stages are normalized illustrative predictions, not acquired
respiratory phases or patient-specific measured motion. This is a research demo,
not a diagnostic tool.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import cast

import itk
import numpy as np
import pyvista as pv


def load_official_tutorial_api(physio_repo: Path):
    """Import the project's official parameters and MONAI Physio dependencies."""
    tutorials_dir = physio_repo / "tutorials"
    if not (tutorials_dir / "parameters_tcia_lung_4d_ct.py").is_file():
        raise FileNotFoundError(
            f"{physio_repo} is not a MONAI Physio source checkout; expected {tutorials_dir}"
        )
    sys.path.insert(0, str(tutorials_dir))
    try:
        from parameters_tcia_lung_4d_ct import TCIA_LUNG_4D_CT
        from monai_physio import (
            DownloadData,
            MONAIPhysioBase,
            ProcessSurfaceMesh,
            WorkflowConvertImageToVTK,
            WorkflowFitStatisticalModelToPatient,
            WorkflowInferMovement,
            WorkflowInferPhysicsNeMo,
        )
    except ImportError as exc:
        raise RuntimeError(
            "MONAI Physio is not installed in this Python environment. Install it "
            "using the official CUDA/GPU instructions in README-phase6.md."
        ) from exc
    return (
        TCIA_LUNG_4D_CT,
        DownloadData,
        MONAIPhysioBase,
        ProcessSurfaceMesh,
        WorkflowConvertImageToVTK,
        WorkflowFitStatisticalModelToPatient,
        WorkflowInferMovement,
        WorkflowInferPhysicsNeMo,
    )


def validate_stages(stages: list[float]) -> None:
    if len(stages) < 2:
        raise ValueError("At least two respiratory stages are required")
    if any(not np.isfinite(stage) or stage < 0.0 or stage >= 1.0 for stage in stages):
        raise ValueError("Stages must be finite normalized values in [0, 1)")
    if stages != sorted(set(stages)):
        raise ValueError("Stages must be unique and strictly increasing")


def run(physio_repo: Path, stages: list[float] | None = None) -> dict[str, object]:
    stages = stages or [i / 10 for i in range(10)]
    validate_stages(stages)
    physio_repo = physio_repo.resolve()
    if not (physio_repo / "pyproject.toml").is_file():
        raise FileNotFoundError(f"MONAI Physio source checkout not found: {physio_repo}")

    (
        parameters,
        download_data,
        base,
        combine_surfaces,
        convert_to_vtk,
        fit_patient,
        infer_movement,
        infer_physicsnemo,
    ) = load_official_tutorial_api(physio_repo)

    # The parameters module resolves these under the official checkout's data,
    # output and network_weights directories, keeping assets with their source.
    test_mode = False
    case_id = "Chest-CT"
    data_dir = parameters.hold_out_directory(test_mode)
    weights_dir = parameters.weights_directory(test_mode)
    output_dir = (
        parameters.output_directory(test_mode)
        / "tutorial_00_infer_respiratory_motion_tcia_lung_3d_ct"
    )
    model_dir = parameters.mgn_weights_directory(test_mode)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Fetch only official MONAI Physio sample data and corresponding released
    # pretrained checkpoint/shape model; no generated images or weights.
    ct_file = download_data.DownloadChestCTData(data_dir)
    download_data.DownloadPhysicsNeMoMGNLungMotionData(weights_dir)
    required = [
        ct_file,
        model_dir / "mgn_stage_model.pt",
        model_dir / "pca_model.json",
        model_dir / "pca_mean_surface.vtp",
    ]
    missing = [Path(path) for path in required if not Path(path).is_file()]
    if missing:
        raise FileNotFoundError("Required official inputs missing: " + ", ".join(map(str, missing)))

    log_level = logging.INFO
    logger = base(class_name="heart3D_phase6_respiratory_motion", log_level=log_level)
    pca_model_file = model_dir / "pca_model.json"
    pca_mean_file = model_dir / "pca_mean_surface.vtp"
    pca_mean_surface = cast(pv.DataSet, pv.read(str(pca_mean_file)))
    import json

    with pca_model_file.open(encoding="utf-8") as stream:
        pca_model = json.load(stream)
    patient_image = itk.imread(str(ct_file))

    # Official MONAI Physio segmentation and surface extraction; the fitted
    # statistical model and checkpoint must be from the same model family.
    segmenter = parameters.segmenter(test_mode, log_level=log_level)
    segmentation = convert_to_vtk(
        segmentation_method=segmenter, log_level=log_level
    ).process(
        input_image=patient_image,
        anatomy_groups=[parameters.anatomy_group],
        surface_reduction_rate=parameters.surface_reduction_rate,
        extract_label_surfaces=True,
        extract_group_surfaces=False,
    )
    lung_surface = combine_surfaces.combine_surfaces(segmentation["label_surfaces"])
    lung_labelmap = segmentation["labelmap"]
    lung_label_ids = list(segmenter.taxonomy.labels_in_group(parameters.anatomy_group))
    lung_mask_array = np.isin(itk.array_from_image(lung_labelmap), lung_label_ids).astype(np.uint8)
    lung_mask = itk.image_from_array(lung_mask_array)
    lung_mask.CopyInformation(lung_labelmap)
    labelmap_file = output_dir / "Chest-CT_lung_labelmap.nii.gz"
    itk.imwrite(lung_labelmap, str(labelmap_file), compression=True)

    fit = fit_patient(
        template_model=pca_mean_surface,
        patient_models=[lung_surface],
        patient_image=patient_image,
        patient_labelmap=lung_mask,
        log_level=log_level,
    )
    fit.set_use_pca_registration(
        use_pca_registration=True,
        pca_model=pca_model,
        number_of_pca_components=parameters.pca_components(test_mode),
        use_surface=False,
    )
    fit.set_icp_transform_type(parameters.icp_transform_type)
    fit.set_mask_dilation_mm(parameters.mask_dilation_mm)
    fit.set_distancemap_squared_max(parameters.distancemap_squared_max)
    fit_result = fit.process()
    if fit.pca_coefficients is None:
        raise RuntimeError("Official MONAI Physio fit did not produce PCA coefficients")

    coefficients_file = output_dir / "Chest-CT_surface.json"
    with coefficients_file.open("w", encoding="utf-8") as stream:
        json.dump(fit.pca_coefficients.tolist(), stream)
    fitted_surface_file = output_dir / "Chest-CT_ssm_surface.vtp"
    fit_result["fitted_reference_mesh"].save(str(fitted_surface_file))

    inference = infer_physicsnemo(model_directory=model_dir, epoch=None, log_level=log_level)
    movement_result = infer_movement(inference, log_level=log_level).process_time_series(
        shape_parameters=coefficients_file,
        stages=stages,
        output_directory=output_dir,
        fitted_reference_mesh=fitted_surface_file,
        reference_image=patient_image,
        warp_interpolation="linear",
        warp_background_value=-1000.0,
        smoothing_sigma_mm=10.0,
        usd_project_name="Chest-CT_predicted_lung_motion",
        anatomy_type="lung",
        separate_by_connectivity=True,
        exterior_mask=lung_mask,
        exterior_falloff_distance_mm=10.0,
    )

    predicted_surfaces = [Path(path) for path in movement_result["predicted_surfaces"]]
    warped_images = [Path(path) for path in movement_result["warped_images"]]
    usd_file = Path(movement_result["usd_file"])
    expected_paths = [labelmap_file, coefficients_file, fitted_surface_file, usd_file, *predicted_surfaces, *warped_images]
    absent = [path for path in expected_paths if not path.is_file()]
    if absent:
        raise RuntimeError("MONAI Physio returned missing outputs: " + ", ".join(map(str, absent)))

    return {
        "case_id": case_id,
        "stages": stages,
        "stage_semantics": "illustrative normalized predictions; source CT is ungated",
        "labelmap": str(labelmap_file),
        "pca_coefficients": str(coefficients_file),
        "fitted_reference_surface": str(fitted_surface_file),
        "predicted_surfaces": [str(path) for path in predicted_surfaces],
        "warped_images": [str(path) for path in warped_images],
        "usd_file": str(usd_file),
        "output_dir": str(output_dir),
        "diagnostic_use": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--physio-repo", type=Path, required=True, help="Path to cloned official Project-MONAI/monai-physio")
    parser.add_argument("--stages", type=float, nargs="+", default=None, help="Normalized stages [0,1); default: 0.0 to 0.9")
    args = parser.parse_args()
    result = run(args.physio_repo, args.stages)
    import json

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
