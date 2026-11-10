# Phase 6 — real MONAI Physio respiratory motion

## Scope and scientific status

This integration uses the official MONAI Physio Tutorial 00 workflow and its released pretrained `physicsnemo_mgn_lung_motion` MeshGraphNet checkpoint, including the matching PCA shape model. It downloads the official `Chest-CT` sample, segments the lungs using the official tutorial segmenter, fits the matching PCA model, predicts per-vertex motion, warps the CT, and exports VTP/MHA/USD outputs.

**Important limitation:** the downloaded Chest-CT is a single ungated 3D scan, not 4D CT. The default stages `0.0, 0.1, …, 0.9` are normalized stages predicted by the model for demonstration. They are not observed acquisition phases, validated patient respiratory measurements, or diagnostic outputs. For measured respiratory phases and evaluation against acquired scans, use the official gated TCIA-4DLung Tutorial 12 and a held-out case.

Model/dataset references and licenses are those of MONAI Physio and the dataset source. The upstream project is Apache-2.0; Chest-CT has its own NCTN Data Archive terms and citation. Read the upstream dataset README before reuse. No artificial CT, masks, motion field, or weights are generated here.

## Hardware and installation

Official MONAI Physio requires Python 3.11–3.13 and an NVIDIA GPU (Turing/compute capability >=7.5, CUDA driver 12.8+). There is no CPU-only mode for segmentation and surrogate inference. Colab must provide a compatible NVIDIA GPU; standard CPU runtime is insufficient.

Follow the **current official installation instructions** because CUDA/PyTorch/torch-scatter wheel compatibility is platform/version-specific:

- https://project-monai.github.io/monai-physio/installation.html
- Recommended CUDA 12.8 using uv (per upstream docs):

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\\Scripts\\activate
python -m pip install uv
uv pip install "monai-physio[cuda12]" --torch-backend=cu128 \\
  -f https://data.pyg.org/whl/torch-2.11.0+cu128.html
```

Clone the upstream source because tutorial support modules are not included in the installed package:

```bash
git clone https://github.com/Project-MONAI/monai-physio.git
```

Check the environment and GPU before launching:

```bash
nvidia-smi
python -c "import torch, monai_physio; print(torch.__version__, torch.cuda.is_available(), monai_physio.__version__); assert torch.cuda.is_available()"
```

## Run the application integration

From the heart3D repository root, with the environment above active:

```bash
python -m pip install -r backend/requirements.txt
python backend/app/simulation/monai_physio_respiratory.py \\
  --physio-repo /path/to/monai-physio
```

The official data/checkpoint download methods are invoked by the script. It writes assets under the upstream checkout's configured `data/`, `tutorials/network_weights/`, and `tutorials/output/` roots. First run downloads several GB of model/data dependencies and needs working network access and free disk space.

For gated phases from a real 4D acquisition, do not use the single-CT stages. Follow the upstream Tutorial 12 data layout and pretrained/trained checkpoint prerequisites instead; that full workflow uses actual `g000`…`g090` phase filenames and evaluates predicted movement with appropriate acquired-frame methods.

## Tests

Pure validation tests (no fabricated image data) check only CLI stage validation and documented constraints:

```bash
python -m pip install pytest
python -m pytest -q tests/test_phase6_respiratory.py
```

The end-to-end test requires the real official sample downloads, a compatible GPU, and all upstream dependencies:

```bash
RUN_MONAI_PHYSIO_E2E=1 python -m pytest -q tests/test_phase6_respiratory.py -m integration
```

This test runs the actual official pipeline, then asserts that the real-data segmentation, fitted surface, per-stage predictions, warped images, and USD exist. It can take substantial time and download storage. Do not mark the phase executed until the command passes in that environment and the logs/assets are inspected.

## Outputs

`backend/app/simulation/monai_physio_respiratory.py` returns output file paths, stage values, and an explicit `diagnostic_use: false` flag. Its JSON result records that the stages are illustrative normalized predictions for an ungated sample. Output files include the lung labelmap, patient PCA coefficients, fitted reference surface, per-stage predicted surfaces and warped CTs, and an animated USD.

## Execution status

This code has been authored against the official API and tutorial source, but this GitHub editing session has no compatible NVIDIA runtime. Installation, download, GPU inference, and end-to-end output assertions have **not** been executed here. The phase remains pending execution in Colab or an equivalent GPU machine.
