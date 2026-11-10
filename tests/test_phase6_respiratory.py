"""Tests for the MONAI Physio respiratory-motion integration."""

import os
from pathlib import Path

import pytest

from backend.app.simulation.monai_physio_respiratory import run, validate_stages


def test_stage_validation_accepts_normalized_demo_cycle():
    validate_stages([i / 10 for i in range(10)])


@pytest.mark.parametrize(
    "stages",
    [[], [0.0], [-0.1, 0.5], [0.0, 1.0], [0.4, 0.3], [0.2, 0.2]],
)
def test_stage_validation_rejects_invalid_stages(stages):
    with pytest.raises(ValueError):
        validate_stages(stages)


@pytest.mark.integration
@pytest.mark.skipif(
    os.environ.get("RUN_MONAI_PHYSIO_E2E") != "1",
    reason="Requires the official multi-GB MONAI Physio downloads and a supported NVIDIA GPU",
)
def test_official_real_chest_ct_motion_pipeline(tmp_path):
    repo = Path(os.environ["MONAI_PHYSIO_REPO"])
    result = run(repo)
    assert result["diagnostic_use"] is False
    assert result["stage_semantics"].startswith("illustrative normalized predictions")
    assert len(result["stages"]) == len(result["predicted_surfaces"]) == len(result["warped_images"])
    for key in ("labelmap", "pca_coefficients", "fitted_reference_surface", "usd_file"):
        assert Path(result[key]).is_file(), key
    assert all(Path(path).is_file() for path in result["predicted_surfaces"])
    assert all(Path(path).is_file() for path in result["warped_images"])
