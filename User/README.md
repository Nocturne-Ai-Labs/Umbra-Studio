# User Runtime Directory

This directory is intentionally empty in source control. Umbra Studio writes
user-owned configuration, datasets, models, outputs, Power Prompter files,
training jobs, and Umbra UI projects into the folders below at runtime.

Only placeholder files belong in the repository. Never commit personal media,
model weights, databases, API keys, generated outputs, or installed tools.

The top-level `Models/` directory is legacy and intentionally omitted. Umbra
models belong in `User/Models/`; ComfyUI models belong in
`Tools/ComfyUI/models/` after ComfyUI is installed.
